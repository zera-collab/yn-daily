'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { DailyReport, User, formatMinutes } from '@/lib/types';

// ブラウザ用クライアントはモジュールスコープで1つだけ生成する
// （毎レンダー作り直すと useEffect の依存が毎回変わってしまうため）
const supabase = createClient();

// 1ページあたりの取得件数。
// 以前は無制限に取得していたため、Supabase のデフォルト上限（1000件）を超えると
// 何の警告もなく古い日報が一覧から消えていた。
const PAGE_SIZE = 100;

const isPending = (s: string) => s === 'submitted' || s === 'revision_requested';

export default function LeaderReportsPage() {
    const [reports, setReports] = useState<(DailyReport & { user: User })[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');

    const fetchPage = useCallback(async (pageIndex: number) => {
        let query = supabase
            .from('daily_reports')
            .select('*, user:users!daily_reports_user_id_fkey(*)');

        if (fromDate) query = query.gte('work_date', fromDate);
        if (toDate) query = query.lte('work_date', toDate);
        if (filterUser) query = query.eq('user_id', filterUser);
        if (filterStatus) query = query.eq('status', filterStatus);

        const { data, error: fetchError } = await query
            .order('work_date', { ascending: false })
            .order('id', { ascending: false }) // 同日内の順序を安定させる
            .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);

        if (fetchError) {
            setError('日報の取得に失敗しました: ' + fetchError.message);
            return [];
        }
        setError(null);
        setHasMore((data || []).length === PAGE_SIZE);
        return (data || []) as (DailyReport & { user: User })[];
    }, [fromDate, toDate, filterUser, filterStatus]);

    // フィルター変更時は先頭ページから読み直す
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            const { data: usersData } = await supabase.from('users').select('*').order('name');
            const rows = await fetchPage(0);
            if (cancelled) return;
            setUsers(usersData || []);
            setReports(rows);
            setLoading(false);
        };
        run();
        return () => { cancelled = true; };
    }, [fetchPage]);

    const handleLoadMore = async () => {
        setLoadingMore(true);
        const rows = await fetchPage(Math.ceil(reports.length / PAGE_SIZE));
        setReports((prev) => [...prev, ...rows]);
        setLoadingMore(false);
    };

    // 未処理（提出済み・差し戻し依頼中）を先頭に。読み込み済みの範囲内で並べ替える
    const sortedReports = useMemo(
        () => [...reports].sort((a, b) => Number(isPending(b.status)) - Number(isPending(a.status))),
        [reports]
    );

    return (
        <div className="animate-fade-in">
            <h1 className="text-xl font-bold text-slate-800 mb-6">日報管理</h1>

            {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                    {error}
                </div>
            )}

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
            ) : sortedReports.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                    日報が見つかりません
                </div>
            ) : (
                <div className="space-y-3">
                    {sortedReports.map((report) => (
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

                    {hasMore && (
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-all disabled:opacity-50"
                        >
                            {loadingMore ? '読み込み中...' : `さらに読み込む（現在 ${sortedReports.length} 件）`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
