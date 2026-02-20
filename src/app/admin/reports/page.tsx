'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { DailyReport, User, formatMinutes } from '@/lib/types';

export default function AdminReportsPage() {
    const supabase = createClient();
    const [reports, setReports] = useState<(DailyReport & { user: User })[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [editingOverride, setEditingOverride] = useState<string | null>(null);
    const [overrideValue, setOverrideValue] = useState<string>('');
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        const { data: usersData } = await supabase.from('users').select('*').order('name');
        setUsers(usersData || []);

        let query = supabase.from('daily_reports').select('*, user:users!daily_reports_user_id_fkey(*)');
        if (filterDate) query = query.eq('work_date', filterDate);
        if (filterUser) query = query.eq('user_id', filterUser);
        if (filterStatus) query = query.eq('status', filterStatus);

        const { data } = await query.order('work_date', { ascending: false });

        const sorted = (data || []).sort((a: DailyReport, b: DailyReport) => {
            const isPending = (s: string) => s === 'submitted' || s === 'revision_requested';
            if (isPending(a.status) && !isPending(b.status)) return -1;
            if (!isPending(a.status) && isPending(b.status)) return 1;
            return 0;
        });

        setReports(sorted as (DailyReport & { user: User })[]);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [filterDate, filterUser, filterStatus]);

    const handleSaveOverride = async (reportId: string) => {
        setSaving(true);
        const val = overrideValue.trim() === '' ? null : Number(overrideValue);
        await supabase
            .from('daily_reports')
            .update({ hourly_rate_override: val })
            .eq('id', reportId);
        setEditingOverride(null);
        setSaving(false);
        fetchData();
    };

    const handleApprove = async (reportId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('daily_reports').update({
            status: 'approved', approved_by: user.id, approved_at: new Date().toISOString(), reject_reason: null,
        }).eq('id', reportId);
        fetchData();
    };

    const handleAllowRevision = async (reportId: string) => {
        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
            .from('daily_reports')
            .update({
                status: 'rejected',
                approved_by: null,
                approved_at: null,
                reject_reason: '修正依頼に基づき、再編集を許可しました。',
            })
            .eq('id', reportId);

        fetchData();
        setSaving(false);
    };

    const handleDeleteReport = async (reportId: string) => {
        if (!confirm('この日報を完全に削除しますか？\nこの操作は取り消せません。')) return;
        setSaving(true);
        const { error } = await supabase.from('daily_reports').delete().eq('id', reportId);
        if (error) {
            alert('削除に失敗しました: ' + error.message);
        }
        setSaving(false);
        fetchData();
    };

    return (
        <div className="animate-fade-in">
            <h1 className="text-xl font-bold mb-6 text-slate-800">日報管理・時給設定</h1>

            {/* Filters */}
            <div className="glass rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">日付</label>
                        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">従業員</label>
                        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
                            <option value="">全員</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">ステータス</label>
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
                            <option value="">全て</option>
                            <option value="submitted">提出済み</option>
                            <option value="approved">承認済み</option>
                            <option value="rejected">差戻し</option>
                            <option value="revision_requested">差戻し依頼中</option>
                        </select>
                    </div>
                </div>
                {(filterDate || filterUser || filterStatus) && (
                    <button onClick={() => { setFilterDate(''); setFilterUser(''); setFilterStatus(''); }}
                        className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-all">
                        フィルターをクリア
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : (
                <div className="glass rounded-2xl overflow-hidden border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">名前</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">日付</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">時間</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">時給上書</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((report) => (
                                    <tr key={report.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{report.user?.name || '不明'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{report.work_date}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {report.start_time}〜{report.end_time}<br />
                                            <span className="text-blue-600 font-medium">{formatMinutes(report.work_minutes)}</span>
                                        </td>
                                        <td className="px-4 py-3"><StatusBadge status={report.status} /></td>
                                        <td className="px-4 py-3 text-right">
                                            {editingOverride === report.id ? (
                                                <input type="number" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)}
                                                    placeholder="空で解除"
                                                    className="w-24 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                                            ) : (
                                                <span className="text-sm text-slate-600 font-mono">
                                                    {report.hourly_rate_override != null ? `¥${report.hourly_rate_override.toLocaleString()}` : '—'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {editingOverride === report.id ? (
                                                    <>
                                                        <button onClick={() => handleSaveOverride(report.id)} disabled={saving}
                                                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-all disabled:opacity-50">保存</button>
                                                        <button onClick={() => setEditingOverride(null)}
                                                            className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">取消</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingOverride(report.id); setOverrideValue(report.hourly_rate_override?.toString() || ''); }}
                                                            className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200">時給</button>
                                                        {report.status === 'submitted' && (
                                                            <button onClick={() => handleApprove(report.id)}
                                                                className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-all font-semibold">承認</button>
                                                        )}
                                                        {report.status === 'revision_requested' && (
                                                            <button onClick={() => handleAllowRevision(report.id)}
                                                                className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition-all font-semibold">編集許可</button>
                                                        )}
                                                        <Link href={`/leader/reports/${report.id}`}
                                                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all font-semibold">詳細</Link>
                                                        <button
                                                            onClick={() => handleDeleteReport(report.id)}
                                                            className="text-xs px-2 py-1 rounded bg-white text-red-600 hover:bg-red-50 transition-all border border-red-200 font-semibold"
                                                        >
                                                            削除
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
            )}
        </div>
    );
}
