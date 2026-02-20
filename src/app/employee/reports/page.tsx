'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { formatMinutes, DailyReport } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function EmployeeReportsPage() {
    const supabase = createClient();
    const router = useRouter();
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMonth, setFilterMonth] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const fetchData = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }

        let query = supabase
            .from('daily_reports')
            .select('*')
            .eq('user_id', user.id);

        if (filterMonth) {
            const startDate = `${filterMonth}-01`;
            const y = parseInt(filterMonth.split('-')[0], 10);
            const m = parseInt(filterMonth.split('-')[1], 10);
            const endDate = new Date(y, m, 0).toISOString().split('T')[0];
            query = query.gte('work_date', startDate).lte('work_date', endDate);
        }

        if (filterStatus) {
            query = query.eq('status', filterStatus);
        }

        const { data } = await query.order('work_date', { ascending: false });
        setReports(data || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterMonth, filterStatus]);

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-slate-800">日報一覧</h1>
                <Link
                    href="/employee/reports/new"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新規作成
                </Link>
            </div>

            {/* フィルター */}
            <div className="glass rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">対象月</label>
                        <input
                            type="month"
                            value={filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
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
                {(filterMonth || filterStatus) && (
                    <button
                        onClick={() => { setFilterMonth(''); setFilterStatus(''); }}
                        className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-all"
                    >
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
            ) : (!reports || reports.length === 0) ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <p className="text-slate-500">条件に一致する日報がありません</p>
                    {!(filterMonth || filterStatus) && (
                        <Link
                            href="/employee/reports/new"
                            className="inline-block mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all"
                        >
                            最初の日報を作成する
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {reports.map((report: DailyReport) => (
                        <Link
                            key={report.id}
                            href={`/employee/reports/${report.id}`}
                            className="block glass rounded-xl p-4 card-hover hover:border-blue-200"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-slate-800">{report.work_date}</span>
                                <StatusBadge status={report.status} />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span>{report.start_time} 〜 {report.end_time}</span>
                                <span>実働 {formatMinutes(report.work_minutes)}</span>
                            </div>
                            {report.content && (
                                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{report.content}</p>
                            )}
                            {report.status === 'rejected' && report.reject_reason && (
                                <div className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                    差戻し理由: {report.reject_reason}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
