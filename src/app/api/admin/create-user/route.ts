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
            return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
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
                hourly_rate_default: hourly_rate_default || 0,
                is_active: true,
                company_id
            });

        if (dbError) {
            console.error('DB insertion error:', dbError);
            // AuthだけできてDB失敗した場合は、不整合を防ぐためAuth側を消す検討も必要だが、まずはログ
            return NextResponse.json({ error: `DB登録失敗: ${dbError.message}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            user: authUser.user,
            password: password // 初期パスワードを1回だけ返す
        });

    } catch (err: any) {
        console.error('System error:', err);
        return NextResponse.json({ error: 'システムエラーが発生しました' }, { status: 500 });
    }
}
