import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import PayslipView, { PayslipData } from "@/components/PayslipView";
import { getMonthRange } from "@/lib/types";
import { notFound, redirect } from "next/navigation";

export default async function PrintablePayslipPage({
    params,
}: {
    params: Promise<{ userId: string; month: string }>;
}) {
    const { userId, month } = await params;

    // "YYYY-MM" 以外は受け付けない
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

    // ---- 認可チェック ----
    // このページは RLS を迂回する service role でデータを取得するため、
    // 閲覧してよいのが「管理者」または「本人」だけであることをここで必ず確認する。
    const authClient = await createClient();
    const { data: { user: currentUser } } = await authClient.auth.getUser();
    if (!currentUser) redirect("/login");

    const { data: currentUserData } = await authClient
        .from("users")
        .select("role")
        .eq("id", currentUser.id)
        .single();

    const isAdmin = currentUserData?.role === "admin";
    const isSelf = currentUser.id === userId;
    if (!isAdmin && !isSelf) notFound();

    const supabase = createAdminClient();

    // 1. Data Fetching
    const { data: user, error: userError } = await supabase
        .from("users")
        .select("*, companies(*)")
        .eq("id", userId)
        .single();

    if (userError || !user) notFound();

    const { startDate, endDate } = getMonthRange(month);

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
        .maybeSingle();

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

    // PDF保存時の初期ファイル名になる（例: 山田太郎_2026年2月報酬明細.pdf）
    // 年を入れないと翌年の同じ月とファイル名が衝突するため年から入れる。
    // ファイル名に使えない文字は下線に置き換える
    const [yearNumber, monthNumber] = month.split("-").map(Number);
    const safeName = user.name.replace(/[\\/:*?"<>|]/g, "_").trim();
    const documentTitle = `${safeName}_${yearNumber}年${monthNumber}月報酬明細`;

    const data: PayslipData = {
        documentTitle,
        monthLabel: `${month.replace("-", "年")}月分`,
        payerName: user.companies?.name || "(法人未設定)",
        payerAddress: user.companies?.address || "",
        recipientName: `${user.name} 様`,
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
