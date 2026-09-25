import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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

    // 管理者権限チェック & レコード不在チェック
    if (dbError || !userData || userData.role !== 'admin') {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 font-inter text-slate-800">
                <div className="glass max-w-lg w-full p-8 rounded-2xl text-center space-y-6">
                    <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2 font-inter">アクセス権限がありません</h2>
                        <p className="text-sm text-slate-600">
                            管理者として登録されている必要があります。<br />
                            現在の権限: <span className="text-orange-600 font-bold">{userData?.role || '未登録'}</span>
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Link href="/" className="block w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all font-semibold text-sm text-slate-600">
                            ホームに戻る
                        </Link>
                        <a href="/login" className="block text-xs text-slate-500 hover:text-blue-600 underline transition-colors">
                            別のアカウントでログイン
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // 3. 無効化チェック
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
                        <h2 className="text-xl font-bold mb-2 text-slate-800">アカウントが停止されています</h2>
                        <p className="text-sm text-slate-600">
                            このアカウントは管理者によって無効化されています。
                        </p>
                    </div>
                    <div className="space-y-3">
                        <a href="/login" className="block w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all font-semibold text-sm text-slate-600">
                            別のアカウントでログイン
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh flex flex-col">
            <Header userName={userData.name} role={userData.role} />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    );
}
