'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { DailyReport, User, formatMinutes } from '@/lib/types';

// ブラウザ用クライアントはモジュールスコープで1つだけ生成する
// （毎レンダー作り直すと useEffect の依存が毎回変わってしまうため）
const supabase = createClient();

export default function LeaderReportDetailPage() {
    const router = useRouter();
    const params = useParams();
    const [report, setReport] = useState<DailyReport & { user: User } | null>(null);
    const [loading, setLoading] = useState(true);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const fetchReport = async () => {
            const { data } = await supabase
                .from('daily_reports')
                .select('*, user:users!daily_reports_user_id_fkey(*)')
                .eq('id', params.id)
                .single();
            setReport(data as DailyReport & { user: User });
            setLoading(false);
        };
        fetchReport();
    }, [params.id]);

    // 更新を実行し、失敗（通信エラー・RLS による拒否＝0件更新）を必ず画面に出す
    const applyUpdate = async (patch: Record<string, unknown>) => {
        setProcessing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            const { data, error } = await supabase
                .from('daily_reports')
                .update(patch)
                .eq('id', params.id)
                .select();

            if (error) {
                alert('更新に失敗しました: ' + error.message);
                return;
            }
            if (!data || data.length === 0) {
                alert('更新できませんでした。権限が無いか、日報が削除された可能性があります。');
                return;
            }

            router.push('/leader/reports');
            router.refresh();
        } finally {
            setProcessing(false);
        }
    };

    const handleApprove = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }
        await applyUpdate({
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            reject_reason: null,
        });
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) return;
        await applyUpdate({
            status: 'rejected',
            approved_by: null,
            approved_at: null,
            reject_reason: rejectReason.trim(),
        });
    };

    const handleAllowRevision = async () => {
        await applyUpdate({
            status: 'rejected',
            approved_by: null,
            approved_at: null,
            reject_reason: '修正依頼に基づき、再編集を許可しました。',
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }

    if (!report) {
        return <div className="text-center py-20 text-slate-500">日報が見つかりません</div>;
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all border border-transparent hover:border-slate-200"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-xl font-bold text-slate-800">日報確認</h1>
                <StatusBadge status={report.status} />
            </div>

            {/* Report content */}
            <div className="glass rounded-2xl p-5 space-y-4 mb-6 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold">
                        {report.user?.name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">{report.user?.name || '不明'}</p>
                        <p className="text-xs text-slate-500 font-medium">{report.work_date}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">開始時刻</label>
                        <p className="text-slate-800 font-medium">{report.start_time}</p>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">終了時刻</label>
                        <p className="text-slate-800 font-medium">{report.end_time}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">休憩</label>
                        <p className="text-slate-800 font-medium">{report.break_minutes}分</p>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">実働時間</label>
                        <p className="text-lg font-bold text-blue-600">{formatMinutes(report.work_minutes)}</p>
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">業務内容</label>
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{report.content || '（内容なし）'}</p>
                </div>

                {report.reject_reason && (
                    <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
                        <span className="font-bold">前回の差戻し理由:</span> {report.reject_reason}
                    </div>
                )}
            </div>

            {/* Actions */}
            {report.status === 'submitted' && (
                <div className="space-y-3">
                    {!showRejectForm ? (
                        <div className="flex gap-3">
                            <button
                                onClick={handleApprove}
                                disabled={processing}
                                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                            >
                                {processing ? '処理中...' : '承認する'}
                            </button>
                            <button
                                onClick={() => setShowRejectForm(true)}
                                disabled={processing}
                                className="flex-1 py-3 px-4 rounded-xl bg-white text-red-600 font-bold hover:bg-red-50 transition-all disabled:opacity-50 border border-red-200"
                            >
                                差戻す
                            </button>
                        </div>
                    ) : (
                        <div className="glass rounded-xl p-4 space-y-3 border border-slate-200">
                            <label className="block text-sm font-bold text-slate-700">差戻し理由</label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all resize-none shadow-inner"
                                placeholder="差戻しの理由を入力してください..."
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={handleReject}
                                    disabled={processing || !rejectReason.trim()}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all disabled:opacity-50"
                                >
                                    {processing ? '処理中...' : '差戻しを確定'}
                                </button>
                                <button
                                    onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-medium border border-slate-200"
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {report.status === 'revision_requested' && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="font-medium">従業員から修正のための差し戻し依頼が届いています。</p>
                    <button
                        onClick={handleAllowRevision}
                        disabled={processing}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all font-bold text-xs disabled:opacity-50 shadow-sm"
                    >
                        {processing ? '処理中...' : '編集を許可する (差戻し)'}
                    </button>
                </div>
            )}

            {report.status === 'approved' && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 shadow-sm">
                    この日報は承認済みです。
                </div>
            )}
        </div>
    );
}
