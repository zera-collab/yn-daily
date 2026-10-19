"use client";

import { useEffect } from "react";

type PayslipLine = { label: string; value: number };

export type PayslipData = {
    monthLabel: string;
    payerName: string;
    payerAddress: string;
    recipientName: string;
    lines: PayslipLine[];
    netLabel: string;
    netValue: number;
    note?: string;
    /** ブラウザの「印刷 / PDFに保存」で初期ファイル名として使われる */
    documentTitle?: string;
};

const yen = (n: number) => {
    const sign = n < 0 ? "-" : n > 0 ? "+" : "";
    const abs = Math.abs(n);
    return `${sign}¥${abs.toLocaleString("ja-JP")}`;
};

export default function PayslipView({ data }: { data: PayslipData }) {
    // ブラウザのPDF保存ダイアログは document.title を初期ファイル名にするため、
    // ルートレイアウトの「日報管理システム」ではなく明細ごとの名前を入れる
    useEffect(() => {
        if (!data.documentTitle) return;
        const previous = document.title;
        document.title = data.documentTitle;
        return () => { document.title = previous; };
    }, [data.documentTitle]);

    return (
        <div className="pageWrap">
            <div className="toolbar noPrint">
                <button className="btn" onClick={() => window.print()}>印刷 / PDF保存</button>
            </div>

            <section className="paper" aria-label="報酬明細書">
                <header className="header">
                    <div>
                        <h1 className="title">報酬明細書</h1>
                        <div className="subtitle">Remuneration Statement</div>
                    </div>
                    <div className="month">対象月: {data.monthLabel}</div>
                </header>

                <div className="twoCol">
                    <div className="box">
                        <div className="boxTitle">報酬支払者 / PAYER</div>
                        <div className="boxBody">
                            <div className="strong">{data.payerName}</div>
                            <div className="muted">{data.payerAddress}</div>
                        </div>
                    </div>

                    <div className="box">
                        <div className="boxTitle">報酬受領者 / RECIPIENT</div>
                        <div className="boxBody">
                            <div className="strong">{data.recipientName}</div>
                        </div>
                    </div>
                </div>

                <table className="table" role="table">
                    <tbody>
                        {data.lines.map((l) => (
                            <tr key={l.label}>
                                <td className="tdLabel">{l.label}</td>
                                <td className="tdValue">{yen(l.value)}</td>
                            </tr>
                        ))}
                        <tr className="netRow">
                            <td className="tdLabel">{data.netLabel}</td>
                            <td className="tdValue">{`¥${data.netValue.toLocaleString("ja-JP")}`}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="noteBlock">
                    <div className="boxTitle">備考 / Note</div>
                    <div className="boxBody" style={{ whiteSpace: 'pre-wrap' }}>{data.note?.trim() ? data.note : "—"}</div>
                </div>

                <footer className="footer">
                    This document is electronically generated.
                </footer>
            </section>

            <style jsx>{`
        .pageWrap { padding: 24px; background: #f4f5f7; min-height: 100vh; }
        .toolbar { max-width: 860px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
        .btn { 
          border: 1px solid #c9ccd1; 
          background: white; 
          padding: 10px 14px; 
          border-radius: 10px; 
          cursor: pointer;
          font-weight: 600;
          color: #374151;
        }
        .btn:hover { background: #f9fafb; }
        .paper {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #d9dde3;
          box-shadow: 0 10px 30px rgba(0,0,0,.06);
          border-radius: 14px;
          padding: 36px;
        }
        .header { display:flex; align-items:flex-end; justify-content:space-between; gap: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; }
        .title { font-size: 28px; margin: 0; letter-spacing: .02em; color: #111827; }
        .subtitle { margin-top: 4px; color: #6b7280; font-size: 14px; }
        .month { font-weight: 600; color: #374151; }
        .twoCol { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
        .box { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        .boxTitle { background: #f9fafb; padding: 10px 12px; font-weight: 700; font-size: 12px; color: #3b82f6; border-bottom: 1px solid #e5e7eb; }
        .boxBody { padding: 12px; }
        .strong { font-weight: 700; color: #111827; }
        .muted { color: #6b7280; margin-top: 6px; line-height: 1.5; font-size: 13px; }

        .table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        .table tr { border-bottom: 1px solid #e5e7eb; }
        .tdLabel { padding: 12px 8px; color: #4b5563; }
        .tdValue { padding: 12px 8px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: #111827; }
        .netRow td { font-weight: 800; border-top: 2px solid #111827; border-bottom: none; padding-top: 14px; font-size: 18px; }
        .netRow .tdValue { color: #3b82f6; }

        .noteBlock { margin-top: 24px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        .footer { margin-top: 40px; color: #9ca3af; font-size: 12px; text-align: right; border-top: 1px solid #f3f4f6; padding-top: 16px; }

        @media print {
          .noPrint { display: none !important; }
          .pageWrap { background: white; padding: 0; }
          .paper { box-shadow: none; border-radius: 0; border: none; max-width: none; padding: 15mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
        </div>
    );
}
