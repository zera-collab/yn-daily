import { createAdminClient } from "@/lib/supabase/admin";
import PayslipView, { PayslipData } from "@/components/PayslipView";
import { notFound } from "next/navigation";

export default async function PrintablePayslipPage({
    params,
}: {
    params: Promise<{ userId: string; month: string }>;
}) {
    const { userId, month } = await params;
    const supabase = createAdminClient();

    // 1. Data Fetching
    const { data: user, error: userError } = await supabase
        .from("users")
        .select("*, companies(*)")
        .eq("id", userId)
        .single();

    if (userError || !user) notFound();

    const startDate = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = new Date(y, m, 0).toISOString().split("T")[0];

    const { data: reports } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "approved")
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date");

    const { data: payslip } = await supabase
        .from("payslips")
        .select("*")
        .eq("user_id", userId)
        .eq("month", month)
        .single();

    // 2. Calculation (Sync with existing logic)
    let totalBasePay = 0;
    (reports || []).forEach((r) => {
        const rate = r.hourly_rate_override ?? user.hourly_rate_default;
        const pay = Math.round((r.work_minutes / 60) * rate);
        totalBasePay += pay;
    });

    const adjust = payslip?.other_adjustment || 0;
    const subtotal = totalBasePay + adjust;
    const miscFee = payslip?.has_misc_fee ? Math.floor(subtotal * 0.1) : 0;
    const dailyPaid = payslip?.daily_paid_amount || 0;
    const finalPay = subtotal - miscFee - dailyPaid;

    const data: PayslipData = {
        monthLabel: `${month.replace("-", "年")}月分`,
        payerName: user.companies?.name || "(法人未設定)",
        payerAddress: user.companies?.address || "",
        recipientName: `${user.name} 業務委託`,
        lines: [
            { label: "運営業務料", value: totalBasePay },
            { label: "調整費 (±)", value: adjust },
            { label: "雑費 (10%)", value: -miscFee },
            { label: "日払い (控除)", value: -dailyPaid },
        ],
        netLabel: "差引支給額",
        netValue: finalPay,
        note: payslip?.note || undefined,
    };

    return <PayslipView data={data} />;
}
