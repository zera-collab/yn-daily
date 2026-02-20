'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ReportForm from '@/components/ReportForm';

export default function NewReportPage() {
    const router = useRouter();
    const supabase = createClient();

    const handleSubmit = async (data: {
        work_date: string;
        start_time: string;
        end_time: string;
        break_minutes: number;
        work_minutes: number;
        content: string;
    }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証エラー');

        // 2) public.users から role を取得
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (userError || !userData) throw new Error('ユーザー情報の取得に失敗しました');
        if (userData.role !== 'employee') {
            // 厳密なチェック（必要に応じてエラーにするか、単にログに残す）
            console.warn('Warning: Non-employee submitting report');
        }

        // 3) work_minutes の再計算（自動計算ロジック）
        // クライアント側計算値も受け取っているが、念のため再計算
        const startParts = data.start_time.split(':').map(Number);
        const endParts = data.end_time.split(':').map(Number);
        let startTotal = startParts[0] * 60 + startParts[1];
        let endTotal = endParts[0] * 60 + endParts[1];

        // 日跨ぎ: end < start の場合は翌日とみなす
        if (endTotal <= startTotal) {
            endTotal += 24 * 60;
        }
        const calculatedWorkMinutes = Math.max(0, endTotal - startTotal - data.break_minutes);

        // 4) 同一日付の日報が既に存在するかチェック
        const { data: existingReport, error: checkError } = await supabase
            .from('daily_reports')
            .select('id')
            .eq('user_id', user.id)
            .eq('work_date', data.work_date)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            // PGRST116 は「見つからない」エラーなので、それ以外のエラーの場合はスロー
            throw new Error('日報の重複チェック中にエラーが発生しました');
        }

        if (existingReport) {
            throw new Error(`エラー: ${data.work_date} の日報は既に提出されています。`);
        }

        const { error } = await supabase.from('daily_reports').insert({
            user_id: user.id,
            work_date: data.work_date,
            start_time: data.start_time,
            end_time: data.end_time,
            break_minutes: data.break_minutes,
            work_minutes: calculatedWorkMinutes, // 自動計算値を保存
            content: data.content,
            status: 'submitted',
        });

        if (error) throw new Error(error.message);

        router.push('/employee/reports');
        router.refresh();
    };

    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-xl font-bold text-slate-800">日報作成</h1>
            </div>

            <div className="glass rounded-2xl p-5">
                <ReportForm onSubmit={handleSubmit} submitLabel="提出する" />
            </div>
        </div>
    );
}
