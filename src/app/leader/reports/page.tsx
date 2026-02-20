'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { DailyReport, User, formatMinutes, ReportStatus } from '@/lib/types';

export default function LeaderReportsPage() {
    const supabase = createClient();
    const [reports, setReports] = useState<(DailyReport & { user: User })[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');

    useEffect(() => {
        const fetchData = async () => {
            // Fetch users for filter
            const { data: usersData } = await supabase
                .from('users')
                .select('*')
                .order('name');
            setUsers(usersData || []);

            // Fetch reports
            let query = supabase
                .from('daily_reports')
                .select('*, user:users!daily_reports_user_id_fkey(*)');

            if (fromDate) {
                query = query.gte('work_date', fromDate);
            }
            if (toDate) {
                query = query.lte('work_date', toDate);
            }
            if (filterUser) {
                query = query.eq('user_id', filterUser);
            }
            if (filterStatus) {
                query = query.eq('status', filterStatus);
            }

            const { data } = await query.order('status', { ascending: true }).order('work_date', { ascending: false });

            // Sort: submitted & revision_requested first
            const sorted = (data || []).sort((a: DailyReport, b: DailyReport) => {
                const isPending = (s: string) => s === 'submitted' || s === 'revision_requested';
                if (isPending(a.status) && !isPending(b.status)) return -1;
                if (!isPending(a.status) && isPending(b.status)) return 1;
                return 0;
            });

            setReports(sorted as (DailyReport & { user: User })[]);
            setLoading(false);
        };
        fetchData();
    }, [fromDate, toDate, filterUser, filterStatus]);

    return (
        <div className="animate-fade-in">
            <h1 className="text-xl font-bold text-slate-800 mb-6">日報管理</h1>

            {/* Filters */}
            <div className="glass rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">開始日</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">終了日</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">従業員</label>
                        <select
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        >
                            <option value="">全員</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">ステータス</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        >
                            <option value="">全て</option>
                            <option value="submitted">提出済み</option>
                            <option value="revision_requested">差し戻し依頼中</option>
                            <option value="approved">承認済み</option>
                            <option value="rejected">差戻し</option>
                        </select>
                    </div>
                </div>
                {(fromDate || toDate || filterUser || (filterStatus !== 'submitted' && filterStatus !== 'revision_requested' && filterStatus !== '')) && (
                    <button
                        onClick={() => { setFromDate(''); setToDate(''); setFilterUser(''); setFilterStatus(''); }}
                        className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-all"
                    >
                        フィルターをクリア
                    </button>
                )}
            </div>

            {/* Reports list */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : reports.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                    日報が見つかりません
                </div>
            ) : (
                <div className="space-y-3">
                    {reports.map((report) => (
                        <Link
                            key={report.id}
                            href={`/leader/reports/${report.id}`}
                            className="block glass rounded-xl p-4 card-hover border border-slate-100 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-slate-800">{report.user?.name || '不明'}</span>
                                    <span className="text-xs text-slate-500 font-medium">{report.work_date}</span>
                                </div>
                                <StatusBadge status={report.status} />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                                <span>{report.start_time} 〜 {report.end_time}</span>
                                <span>休憩 {report.break_minutes}分</span>
                                <span>実働 {formatMinutes(report.work_minutes)}</span>
                            </div>
                            {report.content && (
                                <p className="mt-2 text-sm text-slate-600 line-clamp-2 leading-relaxed">{report.content}</p>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
