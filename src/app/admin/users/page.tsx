'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User as AuthUser } from '@supabase/supabase-js';
import { User, Company, Role } from '@/lib/types'; // Assuming Company type is also in '@/lib/types'

type UserRow = User & { companies?: Company | null };

const errorMessage = (err: unknown) =>
    err instanceof Error ? err.message : '予期しないエラーが発生しました';

const supabase = createClient();

export default function AdminUsersPage() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRate, setEditRate] = useState<number>(0);
    const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<Role>('employee');
    const [saving, setSaving] = useState(false);

    // 新規ユーザー用
    const [showAddForm, setShowAddForm] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [newEmployeeCode, setNewEmployeeCode] = useState('');
    const [newRole, setNewRole] = useState<string>('employee');
    const [newRate, setNewRate] = useState(0);
    const [newCompanyId, setNewCompanyId] = useState<string>('');
    const [createdPassword, setCreatedPassword] = useState<string | null>(null);

    // パスワードリセット用
    const [resettingId, setResettingId] = useState<string | null>(null);
    const [resetPassword, setResetPassword] = useState('');

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setAuthLoading(false);
            if (user) {
                fetchData();
            }
        };
        checkUser();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setFetchError(null);

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .order('name');

        if (userError) {
            console.error('Users fetch error:', userError);
            setFetchError(userError.message);
        }

        const { data: companyData, error: compError } = await supabase
            .from('companies')
            .select('*')
            .order('name');

        if (compError) {
            console.error('Companies fetch error:', compError);
            if (!userError) setFetchError(compError.message);
        }

        const usersList = userData || [];
        const compsList = companyData || [];

        // DBのJOINで失敗・フィルタされるのを防ぐためJS内でLEFT JOIN相当の結合を行う
        const mappedUsers = usersList.map(u => ({
            ...u,
            companies: compsList.find(c => c.id === u.company_id) || null
        }));

        setUsers(mappedUsers as UserRow[]);
        setCompanies(compsList);
        setLoading(false);
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newUserName,
                    employee_code: newEmployeeCode,
                    role: newRole,
                    hourly_rate_default: newRate,
                    company_id: newCompanyId || null
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setCreatedPassword(data.password);
            setNewUserName('');
            // newEmployeeCode は成功画面で表示するため、閉じる時にクリアする
            setNewRate(0);
            setNewCompanyId('');
            fetchData();
        } catch (err) {
            alert(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    // 更新を実行し、失敗（通信エラー・RLS による拒否＝0件更新）を必ず画面に出す
    const updateUser = async (userId: string, patch: Record<string, unknown>) => {
        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .update(patch)
                .eq('id', userId)
                .select();

            if (error) {
                alert('更新に失敗しました: ' + error.message);
                return false;
            }
            if (!data || data.length === 0) {
                alert('更新できませんでした。管理者権限が無い可能性があります。');
                return false;
            }
            return true;
        } finally {
            setSaving(false);
            fetchData();
        }
    };

    const handleToggleActive = async (userId: string, currentStatus: boolean) => {
        if (userId === user?.id && currentStatus) {
            alert('自分自身を無効化することはできません。');
            return;
        }
        await updateUser(userId, { is_active: !currentStatus });
    };

    const handleSaveEdit = async (userId: string) => {
        if (!Number.isInteger(editRate) || editRate < 0) {
            alert('時給は0以上の整数で入力してください');
            return;
        }
        if (userId === user?.id && editRole !== 'admin') {
            alert('自分自身の管理者権限を外すことはできません。');
            return;
        }
        const ok = await updateUser(userId, {
            hourly_rate_default: editRate,
            company_id: editCompanyId || null,
            role: editRole,
        });
        if (ok) setEditingId(null);
    };

    const handleResetPassword = async (userId: string) => {
        if (resetPassword.length < 6) {
            alert('パスワードは6文字以上で入力してください');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newPassword: resetPassword })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            alert('パスワードを更新しました');
            setResettingId(null);
            setResetPassword('');
        } catch (err) {
            alert(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <p className="text-slate-400 mb-4">ログインしてください</p>
                <Link
                    href="/login"
                    className="px-6 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all"
                >
                    ログイン画面へ
                </Link>
            </div>
        );
    }

    return (
        <div className="animate-fade-in max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-slate-800 font-inter">ユーザー管理</h1>
                <button
                    onClick={() => {
                        setShowAddForm(!showAddForm);
                        setCreatedPassword(null);
                        setNewEmployeeCode('');
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新規ユーザー追加
                </button>
            </div>

            {/* 新規追加フォーム */}
            {showAddForm && (
                <div className="glass rounded-2xl p-6 mb-8 border border-slate-200 animate-slide-up">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">新規ユーザー登録</h2>
                    {createdPassword ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-green-700 font-medium mb-2">ユーザーを作成しました！以下の情報を控えてください。</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-500">ログインID (URLでの補完形式)</p>
                                    <p className="text-slate-800 font-mono font-semibold">{newEmployeeCode}@local.invalid</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">初期パスワード</p>
                                    <p className="text-blue-700 font-mono bg-blue-50 px-2 py-1 rounded inline-block font-bold">{createdPassword}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setCreatedPassword(null);
                                    setShowAddForm(false);
                                    setNewEmployeeCode('');
                                }}
                                className="mt-4 text-xs text-slate-400 hover:text-white underline"
                            >
                                閉じる
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">社員コード (ログインID)</label>
                                <input
                                    type="text"
                                    required
                                    value={newEmployeeCode}
                                    onChange={(e) => setNewEmployeeCode(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="E001"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">氏名</label>
                                <input
                                    type="text"
                                    required
                                    value={newUserName}
                                    onChange={(e) => setNewUserName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="山田 太郎"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">ロール</label>
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                >
                                    <option value="employee">従業員</option>
                                    <option value="leader">リーダー</option>
                                    <option value="admin">管理者</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">所属法人（必須）</label>
                                <select
                                    value={newCompanyId}
                                    onChange={(e) => setNewCompanyId(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                >
                                    <option value="">選択してください</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all disabled:opacity-50"
                                >
                                    {saving ? '登録中...' : 'ユーザーを作成'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            <div className="glass rounded-2xl overflow-hidden shadow-xl border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider">社員コード / 名前</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider">所属法人</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider">ロール</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider">状態</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold uppercase tracking-wider">通常時給</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">読み込み中...</td>
                                </tr>
                            ) : fetchError ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-red-400 bg-red-500/10 font-medium">
                                        データの取得にエラーが発生しました: {fetchError}
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">ユーザーがいません</td>
                                </tr>
                            ) : users.map((u) => (
                                <tr key={u.id} className={`hover:bg-white/5 transition-all ${!u.is_active ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === 'admin' ? 'bg-orange-500' : u.role === 'leader' ? 'bg-blue-500' : 'bg-slate-400'
                                                }`}>
                                                {u.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500 font-mono">{u.employee_code || '(未設定)'}</p>
                                                <p className="text-sm font-semibold text-slate-800">{u.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {editingId === u.id ? (
                                            <select
                                                value={editCompanyId || ''}
                                                onChange={(e) => setEditCompanyId(e.target.value || null)}
                                                className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="">(未設定)</option>
                                                {companies.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="text-sm text-slate-600">{u.companies?.name || '—'}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {editingId === u.id ? (
                                            <select
                                                value={editRole}
                                                onChange={(e) => setEditRole(e.target.value as Role)}
                                                className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="employee">従業員</option>
                                                <option value="leader">リーダー</option>
                                                <option value="admin">管理者</option>
                                            </select>
                                        ) : (
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${u.role === 'admin' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' :
                                                u.role === 'leader' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                                                    'bg-slate-500/10 border-slate-500/20 text-slate-400'
                                                }`}>
                                                {u.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                            }`}>
                                            {u.is_active ? '有効' : '無効'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {editingId === u.id ? (
                                            <input
                                                type="number"
                                                value={editRate}
                                                onChange={(e) => setEditRate(Number(e.target.value))}
                                                className="w-24 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm text-right focus:ring-2 focus:ring-blue-500/20"
                                            />
                                        ) : (
                                            <span className="text-sm text-slate-600 font-mono font-medium">¥{u.hourly_rate_default?.toLocaleString() || 0}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {editingId === u.id ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(u.id)} className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </>
                                            ) : resettingId === u.id ? (
                                                <div className="flex items-center gap-2 animate-fade-in">
                                                    <input
                                                        type="password"
                                                        value={resetPassword}
                                                        onChange={(e) => setResetPassword(e.target.value)}
                                                        placeholder="新パスワード"
                                                        className="w-32 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20"
                                                    />
                                                    <button onClick={() => handleResetPassword(u.id)} disabled={saving} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                    <button onClick={() => setResettingId(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => { setResettingId(u.id); setResetPassword(''); }}
                                                        title="パスワード変更"
                                                        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-blue-600 transition-all"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(u.id);
                                                            setEditRate(u.hourly_rate_default);
                                                            setEditCompanyId(u.company_id || null);
                                                            setEditRole(u.role);
                                                        }}
                                                        title="編集"
                                                        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-blue-600 transition-all"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleActive(u.id, u.is_active)}
                                                        title={u.is_active ? '無効にする' : '有効にする'}
                                                        className={`p-1.5 rounded-lg transition-all ${u.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                                                            }`}
                                                    >
                                                        {u.is_active ? (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
