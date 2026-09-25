import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 同一ユーザー・同一勤務日の日報が既に存在しないか確認する。
 * 編集時は自分自身を除外するため excludeId を渡す。
 *
 * DB 側にも UNIQUE 制約を張っているが（supabase/migrations 参照）、
 * 制約違反の生エラーを見せないよう、UI ではここで先に検出する。
 */
export async function assertNoDuplicateReport(
    supabase: SupabaseClient,
    userId: string,
    workDate: string,
    excludeId?: string
): Promise<void> {
    let query = supabase
        .from('daily_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('work_date', workDate);

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query.limit(1);

    if (error) {
        throw new Error('日報の重複チェック中にエラーが発生しました: ' + error.message);
    }
    if (data && data.length > 0) {
        throw new Error(`${workDate} の日報は既に提出されています。`);
    }
}
