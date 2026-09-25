'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, DailyReport, Payslip, formatMinutes, getMonthRange } from '@/lib/types';

// ブラウザ用クライアントはモジュールスコープで1つだけ生成する
// （毎レンダー作り直すと useEffect の依存が毎回変わってしまうため）
const supabase = createClient();

export default function AdminPayslipPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.userId as string;
    const month = params.month as string;

    const [user, setUser] = useState<User | null>(null);
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [payslip, setPayslip] = useState<Payslip | null>(null);
    const [otherAdj, setOtherAdj] = useState<string>('');
    const [dailyPaidAmount, setDailyPaidAmount] = useState<string>('');
    const [hasMiscFee, setHasMiscFee] = useState(false);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // 入力欄に DB の値を流し込むのは初回のみ（編集中の値を上書きしないため）
    const initialized = useRef(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single();
        setUser(userData);

        const { startDate, endDate } = getMonthRange(month);

        const { data: reportsData } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date');
        setReports(reportsData || []);

        const { data: payslipData } = await supabase
            .from('payslips')
            .select('*')
            .eq('user_id', userId)
            .eq('month', month)
            .maybeSingle();

        if (payslipData) {
            setPayslip(payslipData);
            // ユーザーが編集中（または保存直後）に上書きされるのを防ぐため、
            // 初回ロード時のみ DB の値を入力欄にセットする
            if (!initialized.current) {
                initialized.current = true;
                setOtherAdj((payslipData.other_adjustment || 0).toString());
                setDailyPaidAmount((payslipData.daily_paid_amount || 0).toString());
                setHasMiscFee(payslipData.has_misc_fee || false);
                setNote(payslipData.note || '');
            }
        }

        setLoading(false);
    }, [userId, month]);

    useEffect(() => {
        const run = async () => { await fetchData(); };
        run();
    }, [fetchData]);

    const handleSavePayslip = async () => {
        setSaving(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        // String -> Number 変換。nullやundefinedも安全に処理する
        const parseValue = (val: unknown) => {
            const trimmed = String(val || '').trim();
            if (trimmed === '') return 0;
            const parsed = parseInt(trimmed, 10);
            return isNaN(parsed) ? 0 : parsed;
        };

        const finalOtherAdj = parseValue(otherAdj);
        const finalDailyPaid = parseValue(dailyPaidAmount);

        if (payslip) {
            const { error } = await supabase
                .from('payslips')
                .update({
                    other_adjustment: finalOtherAdj,
                    daily_paid_amount: finalDailyPaid,
                    has_misc_fee: hasMiscFee,
                    note: note || null
                })
                .eq('id', payslip.id);

            if (error) {
                console.error("Update error:", error);
                alert("保存に失敗しました: " + error.message);
                setSaving(false);
                return;
            }
        } else {
            const { data: newPayslip, error } = await supabase.from('payslips').insert({
                user_id: userId,
                month,
                other_adjustment: finalOtherAdj,
                daily_paid_amount: finalDailyPaid,
                has_misc_fee: hasMiscFee,
                note: note || null,
                created_by: authUser.id,
            }).select().single();

            if (error) {
                console.error("Insert error:", error);
                alert("保存に失敗しました: " + error.message);
                setSaving(false);
                return;
            }
            if (newPayslip) setPayslip(newPayslip);
        }
        setSaving(false);
        alert("保存しました");
        router.refresh();

        // fetchData() は再度入力内容を上書きしてしまうリスクがあるため削除
        // 必要に応じて reports の再取得のみ行うなどとするが、
        // Payslip の更新であればローカルStateとの同期だけで完結する。
    };


    if (loading || !user) {
        return (
            <div className="flex justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        );
    }

    // Calculate totals
    const dailyDetails = reports.map((r) => {
        const rate = r.hourly_rate_override ?? user.hourly_rate_default;
        const pay = Math.round((r.work_minutes / 60) * rate);
        return { ...r, rate, pay };
    });
    const totalMinutes = dailyDetails.reduce((sum, d) => sum + d.work_minutes, 0);
    const totalPay = dailyDetails.reduce((sum, d) => sum + d.pay, 0);

    // 【新計算ロジック】 
    const basePay = totalPay;
    const adjust = parseInt(otherAdj, 10) || 0;
    const subtotal = basePay + adjust;
    const miscFee = hasMiscFee ? Math.floor(subtotal * 0.10) : 0;
    const dailyPaid = parseInt(dailyPaidAmount, 10) || 0;
    const finalPay = subtotal - miscFee - dailyPaid;

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all border border-transparent hover:border-slate-200">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-800">{user.name} — {month} 明細</h1>
                    <p className="text-xs text-slate-500 font-medium">通常時給: ¥{user.hourly_rate_default.toLocaleString()}/h</p>
                </div>
            </div>

            {/* Daily details */}
            <div className="glass rounded-2xl overflow-hidden mb-6 border border-slate-200 shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">日付</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">勤務時間</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">実働</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">時給</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">金額</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyDetails.map((d) => (
                                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                                    <td className="px-4 py-2.5 text-sm font-semibold text-slate-800">{d.work_date}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-500 font-medium">{d.start_time}〜{d.end_time}</td>
                                    <td className="px-4 py-2.5 text-right text-sm text-slate-600">{formatMinutes(d.work_minutes)}</td>
                                    <td className="px-4 py-2.5 text-right text-sm font-mono text-slate-600">
                                        ¥{d.rate.toLocaleString()}
                                        {d.hourly_rate_override != null && <span className="text-xs text-orange-500 font-bold ml-1">※</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-sm font-mono font-bold text-slate-800">¥{d.pay.toLocaleString()}</td>
                                </tr>
                            ))}
                            {dailyDetails.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">承認済みの日報はありません</td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50/50 border-t border-slate-200">
                                <td className="px-4 py-3 text-sm font-bold text-slate-800" colSpan={2}>合計</td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-slate-800">{formatMinutes(totalMinutes)}</td>
                                <td className="px-4 py-3"></td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-slate-800 font-mono">¥{totalPay.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Adjustments */}
            <div className="glass rounded-2xl p-5 mb-6 border border-slate-200 shadow-sm">
                <h2 className="text-sm font-bold text-slate-800 mb-4">調整項目</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">調整費 (±)</label>
                        <input
                            type="number"
                            value={otherAdj}
                            onChange={(e) => setOtherAdj(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono shadow-inner"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">日払い額 (控除)</label>
                        <input
                            type="number"
                            value={dailyPaidAmount}
                            onChange={(e) => setDailyPaidAmount(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono shadow-inner"
                        />
                    </div>
                    <div className="flex flex-col justify-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={hasMiscFee}
                                onChange={(e) => setHasMiscFee(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                            />
                            <span className="text-sm font-bold text-slate-600 group-hover:text-slate-800 transition-all">雑費10%適用</span>
                        </label>
                    </div>
                </div>
                <div className="mb-4">
                    <label className="block text-xs text-slate-500 mb-1">備考</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none shadow-inner"
                        placeholder="備考がある場合は入力..."
                    />
                </div>
                <button
                    onClick={handleSavePayslip}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                    {saving ? '保存中...' : '調整を保存'}
                </button>
            </div>

            {/* Summary */}
            <div className="glass rounded-2xl p-6 mb-6 border border-slate-200 shadow-sm bg-slate-50/10">
                <h2 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">支給額サマリー</h2>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">運営業務料 (基本報酬)</span>
                        <span className="text-slate-800 font-mono font-bold">¥{basePay.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">調整費</span>
                        <span className={`font-mono font-bold ${adjust >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {adjust >= 0 ? '+' : ''}¥{adjust.toLocaleString()}
                        </span>
                    </div>
                    <div className="border-t border-slate-200 my-1"></div>
                    <div className="flex justify-between text-sm font-bold">
                        <span className="text-slate-700">小計 (雑費対象額)</span>
                        <span className="text-slate-800 font-mono">¥{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">雑費 (10%)</span>
                        <span className="text-red-600 font-mono font-bold">-¥{miscFee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">日払い (控除)</span>
                        <span className="text-red-600 font-mono font-bold">-¥{dailyPaid.toLocaleString()}</span>
                    </div>
                    <div className="border-t-2 border-slate-200 border-dashed pt-4 mt-2 flex justify-between items-center">
                        <span className="text-slate-800 text-lg font-extrabold uppercase tracking-wider">差引支給額</span>
                        <span className="text-4xl font-extrabold text-blue-600 font-mono drop-shadow-sm">¥{finalPay.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Printable Preview */}
            <a
                href={`/payslips/${userId}/${month}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-900 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                報酬明細の印刷 プレビュー
            </a>
        </div>
    );
}
