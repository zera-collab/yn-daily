import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const month = searchParams.get('month');

    if (!userId || !month) {
        return NextResponse.json({ error: 'Missing userId or month' }, { status: 400 });
    }

    const supabase = createAdminClient();

    try {
        // 1. データ取得
        // ユーザーと法人情報
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*, companies(*)')
            .eq('id', userId)
            .single();

        if (userError || !user) throw new Error('User not found');

        // 日報（承認済み）
        const startDate = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const endDate = new Date(y, m, 0).toISOString().split('T')[0];

        const { data: reports } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date');

        // 明細設定
        const { data: payslip } = await supabase
            .from('payslips')
            .select('*')
            .eq('user_id', userId)
            .eq('month', month)
            .single();

        // 2. 計算
        let totalMinutes = 0;
        let basePay = 0;
        const details = (reports || []).map(r => {
            const rate = r.hourly_rate_override ?? user.hourly_rate_default;
            const pay = Math.round((r.work_minutes / 60) * rate);
            totalMinutes += r.work_minutes;
            basePay += pay;
            return {
                date: r.work_date.replace(/-/g, '/'),
                time: `${r.start_time}～${r.end_time}`,
                hours: (r.work_minutes / 60).toFixed(2),
                rate: rate.toLocaleString(),
                amount: pay.toLocaleString()
            };
        });

        const adjust = payslip?.other_adjustment || 0;
        const subtotal = basePay + adjust;
        const miscFee = payslip?.has_misc_fee ? Math.floor(subtotal * 0.10) : 0;
        const dailyPaid = payslip?.daily_paid_amount || 0;
        const finalPay = subtotal - miscFee - dailyPaid;

        const companyName = user.companies?.name || '(法人未設定)';
        const companyAddress = user.companies?.address || '';

        // 3. HTMLテンプレート (Image 2 のスタイルを反映)
        const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Noto Sans JP', sans-serif;
            margin: 0;
            padding: 40px;
            color: #1e293b;
            line-height: 1.5;
            font-size: 14px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 20px;
        }
        .title {
            font-size: 28px;
            font-weight: 700;
            color: #1e293b;
            letter-spacing: 0.1em;
        }
        .meta {
            text-align: right;
            font-size: 12px;
            color: #64748b;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #3b82f6;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        .card {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
        }
        .val-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        .label { color: #64748b; font-size: 11px; }
        .value { font-weight: 500; }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        th {
            background: #3b82f6;
            color: white;
            text-align: left;
            padding: 10px;
            font-size: 11px;
        }
        td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
        }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }

        .summary-wrapper {
            display: flex;
            justify-content: flex-end;
        }
        .summary-card {
            width: 280px;
            background: #1e293b;
            color: white;
            padding: 20px;
            border-radius: 12px;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .summary-row.total {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #334155;
            font-size: 18px;
            font-weight: 700;
        }
        .note {
            margin-top: 40px;
            font-size: 11px;
            color: #64748b;
            border-left: 3px solid #cbd5e1;
            padding-left: 15px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">報酬明細書</div>
            <div style="font-size: 14px; color: #64748b; margin-top: 5px;">Remuneration Statement</div>
        </div>
        <div class="meta">
            <div>対象月: ${month.replace('-', '年')}月分</div>
        </div>
    </div>

    <div class="info-grid">
        <div>
            <div class="section-title">報酬支払者 / Payer</div>
            <div class="card">
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 5px;">${companyName}</div>
                <div style="font-size: 12px; color: #64748b;">${companyAddress}</div>
            </div>
        </div>
        <div>
            <div class="section-title">報酬受領者 / Recipient</div>
            <div class="card">
                <div class="val-row">
                    <span class="label">氏名</span>
                    <span class="value">${user.name} 様</span>
                </div>
            </div>
        </div>
    </div>



    <div class="summary-wrapper">
        <div class="summary-card">
            <div class="summary-row">
                <span>運営業務料 (基本)</span>
                <span>¥${basePay.toLocaleString()}</span>
            </div>
            <div class="summary-row">
                <span>調整費 (±)</span>
                <span>${adjust >= 0 ? '+' : ''}¥${adjust.toLocaleString()}</span>
            </div>
            <div class="summary-row">
                <span>雑費 (10%)</span>
                <span>-¥${miscFee.toLocaleString()}</span>
            </div>
            <div class="summary-row">
                <span>日払い (控除)</span>
                <span>-¥${dailyPaid.toLocaleString()}</span>
            </div>
            <div class="summary-row total">
                <span>差引支給額</span>
                <span style="color: #3b82f6;">¥${finalPay.toLocaleString()}</span>
            </div>
        </div>
    </div>

    ${payslip?.note ? `
    <div class="note">
        <div style="font-weight: 700; margin-bottom: 5px; color: #475569;">備考 / Note</div>
        <div>${payslip.note.replace(/\n/g, '<br>')}</div>
    </div>
    ` : ''}

    <div style="margin-top: 100px; text-align: center; color: #cbd5e1; font-size: 10px;">
        This document is electronically generated.
    </div>
</body>
</html>
        `;

        // 4. Puppeteer で PDF 生成
        // Vercel環境での日本語フォント対応（ローカル配置のフォントを使用）
        await chromium.font(
            path.join(process.cwd(), 'public/fonts/NotoSansJP-VariableFont_wght.ttf')
        );

        const executablePath = await chromium.executablePath();

        const browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
        });

        await browser.close();

        const safeName = encodeURIComponent(`報酬明細_${user.name}_${month}.pdf`);

        return new NextResponse(pdfBuffer as any, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
            },
        });

    } catch (error: any) {
        console.error('PDF Generation Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
