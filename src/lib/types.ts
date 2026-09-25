export type Role = 'employee' | 'leader' | 'admin';
export type ReportStatus = 'submitted' | 'approved' | 'rejected' | 'revision_requested';

export interface Company {
    id: string;
    name: string;
    address: string;
    created_at: string;
}

export interface User {
    id: string;
    name: string;
    role: 'employee' | 'leader' | 'admin';
    employee_code?: string;
    is_active: boolean;
    hourly_rate_default: number;
    company_id?: string; // 所属法人ID
    created_at: string;
}

export interface DailyReport {
    id: string;
    user_id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    work_minutes: number;
    status: 'submitted' | 'approved' | 'rejected' | 'revision_requested';
    content: string;
    hourly_rate_override?: number | null;
    reject_reason?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
    created_at: string;
}

export interface Payslip {
    id: string;
    user_id: string;
    month: string;
    /** @deprecated 保存されるだけで支給額の計算には一切使われていない。調整は other_adjustment を使うこと。 */
    daily_pay_adjustment: number;
    other_adjustment: number;
    daily_paid_amount: number; // 日払い
    has_misc_fee: boolean; // 雑費あり
    note?: string | null;
    created_by: string;
    created_at: string;
}

export interface PayrollSummary {
    user: User;
    month: string;
    totalWorkMinutes: number;
    dailyDetails: {
        date: string;
        workMinutes: number;
        hourlyRate: number;
        dailyPay: number;
    }[];
    totalBasePay: number;
    dailyPayAdjustment: number;
    otherAdjustment: number;
    totalPay: number;
}

// 30分刻みの時刻オプション生成
export const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
        TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
}

// 休憩時間オプション（0〜240分、30分刻み）
export const BREAK_OPTIONS: number[] = [];
for (let i = 0; i <= 240; i += 30) {
    BREAK_OPTIONS.push(i);
}

// 実働時間計算（日跨ぎ対応）
export function calculateWorkMinutes(
    startTime: string,
    endTime: string,
    breakMinutes: number
): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startTotal = sh * 60 + sm;
    let endTotal = eh * 60 + em;
    // 日跨ぎ: end < start の場合のみ翌日とみなす
    // （end === start は 24時間勤務ではなく実働0分として扱う）
    if (endTotal < startTotal) {
        endTotal += 24 * 60;
    }
    return Math.max(0, endTotal - startTotal - breakMinutes);
}

// 分を「◯時間◯分」に変換
export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
}

/**
 * "YYYY-MM" から、その月の初日・末日を "YYYY-MM-DD" で返す。
 *
 * new Date(y, m, 0).toISOString() はローカル時刻の月末0時を UTC に変換するため、
 * JST（UTC+9）では前日の日付になり、月末日の日報が集計から漏れていた。
 * ここでは UTC 上で日付計算を行い、タイムゾーンに依存しないようにする。
 */
export function getMonthRange(month: string): { startDate: string; endDate: string } {
    const [y, m] = month.split('-').map(Number);
    // Date.UTC(y, m, 0) は「m月の0日目」= m月の前月（= 指定月）の末日
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
        startDate: `${month}-01`,
        endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
}

/**
 * 実行環境のローカルタイムゾーンでの「今日」を "YYYY-MM-DD" で返す。
 * new Date().toISOString() だと JST の朝9時前に前日の日付になってしまう。
 */
export function getTodayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
