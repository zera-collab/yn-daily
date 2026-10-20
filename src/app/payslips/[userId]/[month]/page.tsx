import { cache } from "react";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import PayslipView, { PayslipData } from "@/components/PayslipView";
import { getMonthRange } from "@/lib/types";
import { notFound, redirect } from "next/navigation";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 認可チェックと対象ユーザーの取得。
 * generateMetadata と本体の両方から呼ぶため react の cache() で
 * 1リクエスト内の重複クエリを防ぐ。
 */
const loadPayslipUser = cache(async (userId: string) => {
    // このページは RLS を迂回する service role でデータを取得するため、
    // 閲覧してよいのが「管理者」または「本人」だけであることをここで必ず確認する。
    const authClient = await createClient();
    const { data: { user: currentUser } } = await authClient.auth.getUser();
    if (!currentUser) return { status: "unauthenticated" as const };

    const { data: currentUserData } = await authClient
        .from("users")
        .select("role")
        .eq("id", currentUser.id)
        .single();

    const isAdmin = currentUserData?.role === "admin";
    const isSelf = currentUser.id === userId;
    if (!isAdmin && !isSelf) return { status: "forbidden" as const };

    const { data: user, error } = await createAdminClient()
        .from("users")
        .select("*, companies(*)")
        .eq("id", userId)
        .single();

    if (error || !user) return { status: "forbidden" as const };
    return { status: "ok" as const, user };
});

/** PDF保存時の初期ファイル名になる（例: 山田太郎_2026年2月報酬明細.pdf） */
function buildDocumentTitle(name: string, month: string) {
    const [year, monthNumber] = month.split("-").map(Number);
    // ファイル名に使えない文字は下線に置き換える
    const safeName = name.replace(/[\\/:*?"<>|]/g, "_").trim();
    return `${safeName}_${year}年${monthNumber}月報酬明細`;
}

// ブラウザの「印刷 / PDFに保存」は document.title を初期ファイル名に使う。
// クライアント側で書き換えても Next.js のメタデータが後から上書きしてしまうため、
// ここでサーバー側のタイトルそのものを差し替える。
export async function generateMetadata({
    params,
}: {
    params: Promise<{ userId: string; month: string }>;
}): Promise<Metadata> {
    const { userId, month } = await params;
    if (!MONTH_PATTERN.test(month)) return {};

    const result = await loadPayslipUser(userId);
    // 権限が無い場合は氏名を漏らさないため既定のタイトルのままにする
    if (result.status !== "ok") return {};

    return { title: buildDocumentTitle(result.user.name, month) };
}

export default async function PrintablePayslipPage({
    params,
}: {
    params: Promise<{ userId: string; month: string }>;
}) {
    const { userId, month } = await params;

    // "YYYY-MM" 以外は受け付けない
    if (!MONTH_PATTERN.test(month)) notFound();

    const access = await loadPayslipUser(userId);
    if (access.status === "unauthenticated") redirect("/login");
    if (access.status !== "ok") notFound();
    const user = access.user;

    const supabase = createAdminClient();

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

    // generateMetadata と同じタイトル。メタデータの反映が遅れた場合の保険として
    // クライアント側でも document.title を設定する
    const data: PayslipData = {
        documentTitle: buildDocumentTitle(user.name, month),
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
