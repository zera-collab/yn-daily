'use client';

import { useState, useEffect } from 'react';
import { TIME_OPTIONS, BREAK_OPTIONS, calculateWorkMinutes, formatMinutes, getTodayLocal } from '@/lib/types';

interface ReportFormProps {
    initialData?: {
        work_date: string;
        start_time: string;
        end_time: string;
        break_minutes: number;
        content: string;
    };
    onSubmit: (data: {
        work_date: string;
        start_time: string;
        end_time: string;
        break_minutes: number;
        work_minutes: number;
        content: string;
    }) => Promise<void>;
    disabled?: boolean;
    submitLabel?: string;
}

export default function ReportForm({ initialData, onSubmit, disabled, submitLabel = '保存' }: ReportFormProps) {
    const today = getTodayLocal();
    const [workDate, setWorkDate] = useState(initialData?.work_date || today);
    const [startTime, setStartTime] = useState(initialData?.start_time || '09:00');
    const [endTime, setEndTime] = useState(initialData?.end_time || '18:00');
    const [breakMinutes, setBreakMinutes] = useState(initialData?.break_minutes ?? 60);
    const [content, setContent] = useState(initialData?.content || '');
    const [workMinutes, setWorkMinutes] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setWorkMinutes(calculateWorkMinutes(startTime, endTime, breakMinutes));
    }, [startTime, endTime, breakMinutes]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await onSubmit({
                work_date: workDate,
                start_time: startTime,
                end_time: endTime,
                break_minutes: breakMinutes,
                work_minutes: workMinutes,
                content,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : '保存に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5 pb-24">
            {/* 日付 */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">勤務日</label>
                <input
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    disabled={disabled}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                />
            </div>

            {/* 開始時刻・終了時刻 */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">開始時刻</label>
                    <select
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={disabled}
                        className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                    >
                        {TIME_OPTIONS.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">終了時刻</label>
                    <select
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={disabled}
                        className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                    >
                        {TIME_OPTIONS.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 休憩時間 */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">休憩時間</label>
                <select
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    disabled={disabled}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50"
                >
                    {BREAK_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}分</option>
                    ))}
                </select>
            </div>

            {/* 実働時間（自動計算表示） */}
            <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-600">実働時間</span>
                    <span className="text-lg font-bold text-blue-700">{formatMinutes(workMinutes)}</span>
                </div>
                {endTime < startTime && (
                    <p className="text-xs text-blue-600/70 mt-1">※ 日跨ぎ（翌日終了）として計算しています</p>
                )}
            </div>

            {/* 業務内容 */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">業務内容</label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={disabled}
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50 resize-none"
                    placeholder="本日の業務内容を入力..."
                />
            </div>

            {error && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                    {error}
                </div>
            )}

            {/* 保存ボタン（下部固定） */}
            {!disabled && (
                <div className="bottom-bar">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:from-blue-700 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                    >
                        {loading ? (
                            <span className="inline-flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                保存中...
                            </span>
                        ) : (
                            submitLabel
                        )}
                    </button>
                </div>
            )}
        </form>
    );
}
