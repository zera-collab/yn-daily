import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
        const { userId, newPassword } = await request.json();

        if (!userId || !newPassword || newPassword.length < 6) {
            return NextResponse.json({ error: 'パスワードは6文字以上で入力してください' }, { status: 400 });
        }

        const adminClient = createAdminClient();

        // 3. パスワード更新 (Auth)
        const { error: authError } = await adminClient.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        );

        if (authError) {
            console.error('Password update error:', authError);
            return NextResponse.json({ error: `パスワード更新失敗: ${authError.message}` }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (err) {
        console.error('System error:', err);
        return NextResponse.json({ error: 'システムエラーが発生しました' }, { status: 500 });
    }
}
