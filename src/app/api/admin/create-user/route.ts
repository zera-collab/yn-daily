import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        // 1. 呼び出し元の権限チェック
        const supabase = await createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        if (!currentUser) {
            return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
        }

        const { data: roleData } = await supabase
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
        }

        // 2. リクエストデータの取得
        const { employee_code, name, role, hourly_rate_default, company_id } = await request.json();

        if (!employee_code || !name || !role || !company_id) {
            return NextResponse.json({ error: '社員コード・氏名・権限・所属法人はすべて必須です' }, { status: 400 });
        }

        // 社員コードはメールアドレスのローカル部として使うため文字種を制限する
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(employee_code)) {
            return NextResponse.json({
                error: '社員コードは半角英数字と . _ - のみ使用できます',
            }, { status: 400 });
        }

        if (!['employee', 'leader', 'admin'].includes(role)) {
            return NextResponse.json({ error: '権限の指定が不正です' }, { status: 400 });
        }

        const rate = Number(hourly_rate_default ?? 0);
        if (!Number.isInteger(rate) || rate < 0) {
            return NextResponse.json({ error: '時給は0以上の整数で入力してください' }, { status: 400 });
        }

        // 3. パスワード生成
        const password = crypto.randomBytes(8).toString('hex');
        const email = `${employee_code}@local.invalid`;

        const adminClient = createAdminClient();

        // 4. Auth ユーザー作成
        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { name, role }
        });

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        // 5. public.users レコード作成 (Triggerが動くはずだが、念のため明示的に更新/作成)
        // employee_code と is_active を確実にセットする
        const { error: dbError } = await adminClient
            .from('users')
            .upsert({
                id: authUser.user.id,
                employee_code,
                name,
                role,
                hourly_rate_default: rate,
                is_active: true,
                company_id
            });

        if (dbError) {
            console.error('DB insertion error:', dbError);
            // Auth だけ作成されて DB 登録に失敗すると、孤立したアカウントが残り
            // その社員コード（= メールアドレス）が二度と使えなくなる。
            // ロールバックとして Auth 側も削除する。
            const { error: cleanupError } = await adminClient.auth.admin.deleteUser(authUser.user.id);
            if (cleanupError) {
                console.error('Rollback (auth user delete) failed:', cleanupError);
                return NextResponse.json({
                    error: `DB登録に失敗し、認証ユーザーの取り消しにも失敗しました。管理者に連絡してください（ID: ${authUser.user.id}）`,
                }, { status: 500 });
            }
            return NextResponse.json({ error: `DB登録失敗: ${dbError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            user: authUser.user,
            password: password // 初期パスワードを1回だけ返す
        });

    } catch (err) {
        console.error('System error:', err);
        return NextResponse.json({ error: 'システムエラーが発生しました' }, { status: 500 });
    }
}
