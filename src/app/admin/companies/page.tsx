'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Company } from '@/lib/types';

export default function AdminCompaniesPage() {
    const supabase = createClient();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchCompanies = async () => {
        setLoading(true);
        const { data } = await supabase.from('companies').select('*').order('created_at');
        setCompanies(data || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchCompanies();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        if (editingId) {
            await supabase
                .from('companies')
                .update({ name, address })
                .eq('id', editingId);
        } else {
            await supabase
                .from('companies')
                .insert({ name, address });
        }

        setName('');
        setAddress('');
        setEditingId(null);
        setSaving(false);
        fetchCompanies();
    };

    const handleEdit = (company: Company) => {
        setEditingId(company.id);
        setName(company.name);
        setAddress(company.address);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('この法人を削除しますか？')) return;
        await supabase.from('companies').delete().eq('id', id);
        fetchCompanies();
    };

    return (
        <div className="animate-fade-in space-y-8">
            <h1 className="text-xl font-bold text-slate-800">法人マスタ管理</h1>

            {/* Form */}
            <div className="glass rounded-2xl p-6 border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">
                    {editingId ? '法人情報を編集' : '新しい法人を登録'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">法人名</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="株式会社〇〇"
                                className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-inter"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">住所</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                required
                                placeholder="東京都..."
                                className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-inter"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50"
                        >
                            {editingId ? '更新する' : '登録する'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingId(null);
                                    setName('');
                                    setAddress('');
                                }}
                                className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl transition-all font-medium"
                            >
                                キャンセル
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* List */}
            <div className="glass rounded-2xl overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">法人名</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">住所</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-sm">読み込み中...</td>
                                </tr>
                            ) : companies.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-sm">法人が登録されていません。</td>
                                </tr>
                            ) : (
                                companies.map((c) => (
                                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                                        <td className="px-6 py-4 text-sm text-slate-800 font-semibold">{c.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500">{c.address}</td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button
                                                onClick={() => handleEdit(c)}
                                                className="text-xs text-blue-400 hover:text-blue-300 transition-all"
                                            >
                                                編集
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                className="text-xs text-red-400 hover:text-red-300 transition-all"
                                            >
                                                削除
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
