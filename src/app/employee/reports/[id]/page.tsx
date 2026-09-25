'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ReportForm from '@/components/ReportForm';
import StatusBadge from '@/components/StatusBadge';
import { DailyReport, formatMinutes, calculateWorkMinutes } from '@/lib/types';
import { assertNoDuplicateReport } from '@/lib/reports';

// ブラウザ用クライアントはモジュールスコープで1つだけ生成する
// （毎レンダー作り直すと useEffect の依存が毎回変わってしまうため）
const supabase = createClient();

export default function ReportDetailPage() {
    const router = useRouter();
    const params = useParams();
    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [requesting, setRequesting] = useState(false);

    useEffect(() => {
        const fetchReport = async () => {
            const { data } = await supabase
                .from('daily_reports')
                .select('*')
                .eq('id', params.id)
                .single();
            setReport(data);
            setLoading(false);
        };
        fetchReport();
    }, [params.id]);

    const handleSubmit = async (data: {
        work_date: string;
        start_time: string;
        end_time: string;
        break_minutes: number;
        work_minutes: number;
        content: string;
    }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証エラー');

        // 勤務日を別の日に変更した場合に重複しないかチェック（自分自身は除外）
        await assertNoDuplicateReport(supabase, user.id, data.work_date, String(params.id));

        // 新規作成と同じく work_minutes は受け取った値をそのまま使わず再計算する
        const calculatedWorkMinutes = calculateWorkMinutes(
            data.start_time,
            data.end_time,
            data.break_minutes
        );

        const { data: updated, error } = await supabase
            .from('daily_reports')
            .update({
                ...data,
                work_minutes: calculatedWorkMinutes,
                status: 'submitted',
            })
            .eq('id', params.id)
            .select();

        if (error) throw new Error(error.message);
        if (!updated || updated.length === 0) {
            throw new Error('更新できませんでした。この日報は編集できない状態になっている可能性があります。');
        }

        router.push('/employee/reports');
        router.refresh();
    };

    const handleRequestRevision = async () => {
        if (!confirm('この日報の差し戻し（修正可能状態への変更）を管理者に依頼しますか？')) return;
        setRequesting(true);
        const { data: updated, error } = await supabase
            .from('daily_reports')
            .update({
                status: 'revision_requested',
            })
            .eq('id', params.id)
            .select();

        if (error) {
            alert('依頼に失敗しました: ' + error.message);
            setRequesting(false);
            return;
        }
        if (!updated || updated.length === 0) {
            alert('依頼できませんでした。すでに差し戻し済みか、権限が無い可能性があります。');
            setRequesting(false);
            return;
        }

        router.push('/employee/reports');
        router.refresh();
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
        return (
            <div className="text-center py-20 text-slate-500">
                日報が見つかりません
            </div>
        );
    }

    const isApproved = report.status === 'approved';

    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-xl font-bold text-slate-800">日報詳細</h1>
                <StatusBadge status={report.status} />
            </div>

            {isApproved && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <p>この日報は承認済みのため編集できません</p>
                    <button
                        onClick={handleRequestRevision}
                        disabled={requesting}
                        className="text-xs px-3 py-1.5 bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-all font-bold disabled:opacity-50"
                    >
                        {requesting ? '依頼中...' : '修正を依頼する (差し戻し依頼)'}
                    </button>
                </div>
            )}

            {report.status === 'revision_requested' && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 shadow-sm font-medium">
                    管理者に差し戻しを依頼中です。承認されるまでお待ちください。
                </div>
            )}

            {report.status === 'rejected' && report.reject_reason && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    <span className="font-semibold text-red-800">差戻し理由:</span> {report.reject_reason}
                </div>
            )}

            {isApproved || report.status === 'revision_requested' ? (
                <div className="glass rounded-2xl p-5 space-y-4 border border-slate-200 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">勤務日</label>
                            <p className="text-slate-800 font-medium">{report.work_date}</p>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">実働時間</label>
                            <p className="text-slate-800 font-medium">{formatMinutes(report.work_minutes)}</p>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">開始時刻</label>
                            <p className="text-slate-800 font-medium">{report.start_time}</p>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">終了時刻</label>
                            <p className="text-slate-800 font-medium">{report.end_time}</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">休憩時間</label>
                        <p className="text-slate-800 font-medium">{report.break_minutes}分</p>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">業務内容</label>
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{report.content}</p>
                    </div>
                </div>
            ) : (
                <div className="glass rounded-2xl p-5">
                    <ReportForm
                        initialData={{
                            work_date: report.work_date,
                            start_time: report.start_time,
                            end_time: report.end_time,
                            break_minutes: report.break_minutes,
                            content: report.content,
                        }}
                        onSubmit={handleSubmit}
                        submitLabel="更新して再提出"
                    />
                </div>
            )}
        </div>
    );
}
