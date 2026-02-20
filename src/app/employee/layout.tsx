import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Header from '@/components/Header';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. 認証チェック
    if (!user) redirect('/login');

    // 2. DBレコード取得
    const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('name, role, is_active')
        .eq('id', user.id)
        .single();

    // 3. エラーハンドリング (レコードがない場合)
    if (dbError || !userData) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4">
                <div className="glass max-w-lg w-full p-8 rounded-2xl text-center space-y-6 text-slate-800">
                    <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto text-yellow-500">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-2">初期設定が未完了です</h2>
                        <p className="text-sm text-slate-600">
                            このアカウント（{user.email}）のセットアップが必要です。
                        </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs text-blue-600 break-all">
                        {user.id}
                    </div>
                    <div className="space-y-4">
                        <a href="/login" className="block text-sm text-slate-500 hover:text-blue-600 underline transition-colors">
                            別のカウントでログイン
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // 4. 無効化チェック
    if (!userData.is_active) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 font-inter text-slate-800">
                <div className="glass max-w-md w-full p-8 rounded-2xl text-center space-y-6">
                    <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-500">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-2">アカウントが停止されています</h2>
                        <p className="text-sm text-slate-600">
                            このアカウントは管理者によって無効化されています。<br />
                            心当たりがない場合は管理者に連絡してください。
                        </p>
                    </div>
                    <div className="space-y-3">
                        <a href="/login" className="block w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all font-semibold text-sm text-slate-600">
                            別のカウントでログイン
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh flex flex-col">
            <Header userName={userData.name} role={userData.role} />
            <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    );
}
