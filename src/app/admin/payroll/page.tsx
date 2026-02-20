'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, DailyReport, Payslip, formatMinutes } from '@/lib/types';

export default function AdminPayrollPage() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const router = useRouter();
    const now = new Date();
    const defaultMonth = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [month, setMonth] = useState(defaultMonth);
    const [users, setUsers] = useState<User[]>([]);
    const [reportsByUser, setReportsByUser] = useState<Record<string, DailyReport[]>>({});
    const [payslips, setPayslips] = useState<Record<string, Payslip>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [month]);

    const fetchData = async () => {
        setLoading(true);
        // Users
        const { data: usersData } = await supabase.from('users').select('*').order('name');
        setUsers(usersData || []);

        // Approved reports for month
        const startDate = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const endDate = new Date(y, m, 0).toISOString().split('T')[0];

        const { data: reportsData } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('status', 'approved')
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date');

        const grouped: Record<string, DailyReport[]> = {};
        (reportsData || []).forEach((r: DailyReport) => {
            if (!grouped[r.user_id]) grouped[r.user_id] = [];
            grouped[r.user_id].push(r);
        });
        setReportsByUser(grouped);

        // Payslips for month
        const { data: payslipsData } = await supabase
            .from('payslips')
            .select('*')
            .eq('month', month);

        const payslipMap: Record<string, Payslip> = {};
        (payslipsData || []).forEach((p: Payslip) => {
            payslipMap[p.user_id] = p;
        });
        setPayslips(payslipMap);

        setLoading(false);
    };

    const calculateUserPay = (user: User, reports: DailyReport[]) => {
        let totalMinutes = 0;
        let totalPay = 0;
        reports.forEach((r) => {
            totalMinutes += r.work_minutes;
            const rate = r.hourly_rate_override ?? user.hourly_rate_default;
            totalPay += Math.round((r.work_minutes / 60) * rate);
        });
        const payslip = payslips[user.id];
        const adjust = payslip?.other_adjustment || 0;
        const subtotal = totalPay + adjust;
        const miscFee = payslip?.has_misc_fee ? Math.floor(subtotal * 0.10) : 0;
        const dailyPaid = payslip?.daily_paid_amount || 0;
        const finalPay = subtotal - miscFee - dailyPaid;

        return {
            totalMinutes,
            totalPay,
            adjust,
            miscFee,
            dailyPaid,
            finalPay,
        };
    };

    const handleMonthChange = (newMonth: string) => {
        setMonth(newMonth);
        router.push(`/admin/payroll?month=${newMonth}`);
    };

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-slate-800">月次集計</h1>
                <input
                    type="month"
                    value={month}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                />
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
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">従業員</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">勤務日数</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">総勤務時間</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">基本報酬</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">調整費(±)</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">雑費(10%)</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">日払(控除)</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">最終支給額</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const reports = reportsByUser[user.id] || [];
                                    const calc = calculateUserPay(user, reports);
                                    return (
                                        <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                                                        <p className="text-xs text-slate-500">¥{user.hourly_rate_default.toLocaleString()}/h</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-600">{reports.length}日</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-600 font-mono">{formatMinutes(calc.totalMinutes)}</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-800 font-mono font-medium">¥{calc.totalPay.toLocaleString()}</td>
                                            <td className={`px-4 py-3 text-right text-sm font-mono font-medium ${calc.adjust >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {calc.adjust >= 0 ? '+' : ''}¥{calc.adjust.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-mono text-slate-500">
                                                -¥{calc.miscFee.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-mono text-slate-500">
                                                -¥{calc.dailyPaid.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-lg font-bold text-slate-800 font-mono">¥{calc.finalPay.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                <Link
                                                    href={`/admin/payslip/${user.id}/${month}`}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/80 text-white hover:bg-blue-600 transition-all"
                                                >
                                                    明細
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
