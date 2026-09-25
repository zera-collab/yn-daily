import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font 経由で読み込むことでビルド時にセルフホストされ、
// 外部CDNへのリクエストとレイアウトシフトが無くなる
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "日報管理システム",
  description: "社内日報管理・承認・給与計算システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={inter.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
