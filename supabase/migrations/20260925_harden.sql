-- ============================================================
-- セキュリティ・整合性の強化マイグレーション
--   Supabase SQL Editor に貼り付けて実行してください。
--   何度実行しても安全（冪等）です。
-- ============================================================

-- ------------------------------------------------------------
-- 1. daily_reports の列レベル保護 + 実働時間のサーバー再計算
--
--    RLS は「行」単位でしか制御できないため、従業員が自分の未承認日報に
--    対して hourly_rate_override（時給上書き）や approved_by を
--    直接 REST API で書き換えられる状態だった。
--    BEFORE トリガーで、権限のないユーザーの変更を元の値に戻す。
--
--    あわせて work_minutes を常にサーバー側で再計算し、
--    クライアントから送られてきた申告値を信用しないようにする。
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_daily_report_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_role         TEXT;
  v_is_privileged BOOLEAN;
  v_start        INT;
  v_end          INT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

  v_is_privileged :=
       COALESCE(v_role IN ('leader', 'admin'), FALSE)
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role';

  -- 実働時間は常に再計算する（日跨ぎ対応。end = start は実働0分）
  v_start := split_part(NEW.start_time, ':', 1)::INT * 60
           + split_part(NEW.start_time, ':', 2)::INT;
  v_end   := split_part(NEW.end_time,   ':', 1)::INT * 60
           + split_part(NEW.end_time,   ':', 2)::INT;
  IF v_end < v_start THEN
    v_end := v_end + 24 * 60;
  END IF;
  NEW.work_minutes := GREATEST(0, v_end - v_start - COALESCE(NEW.break_minutes, 0));

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged THEN
      -- 従業員は「提出済み」の日報しか作れない
      NEW.status               := 'submitted';
      NEW.hourly_rate_override := NULL;
      NEW.approved_by          := NULL;
      NEW.approved_at          := NULL;
      NEW.reject_reason        := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT v_is_privileged THEN
    NEW.user_id              := OLD.user_id;
    NEW.hourly_rate_override := OLD.hourly_rate_override;
    NEW.approved_by          := OLD.approved_by;
    NEW.approved_at          := OLD.approved_at;
    NEW.reject_reason        := OLD.reject_reason;
    -- 従業員が指定できるステータスは「提出」と「差し戻し依頼」のみ
    IF NEW.status NOT IN ('submitted', 'revision_requested') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_daily_report_rules ON public.daily_reports;
CREATE TRIGGER enforce_daily_report_rules
  BEFORE INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_report_rules();


-- ------------------------------------------------------------
-- 2. 同一ユーザー・同一日の日報を1件に制限
--
--    これまではアプリ側（新規作成画面）でしか重複チェックをしておらず、
--    編集画面で勤務日を変更すると重複登録できてしまった。
--    既存データに重複がある場合は制約を張らず、警告だけ出す。
-- ------------------------------------------------------------

DO $$
DECLARE
  v_dupes INT;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT user_id, work_date
    FROM public.daily_reports
    GROUP BY user_id, work_date
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING
      '重複した日報が % 組あるため UNIQUE 制約をスキップしました。以下のクエリで確認・整理してから再実行してください: SELECT user_id, work_date, COUNT(*) FROM public.daily_reports GROUP BY 1,2 HAVING COUNT(*) > 1;',
      v_dupes;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'daily_reports_user_id_work_date_key'
    ) THEN
      ALTER TABLE public.daily_reports
        ADD CONSTRAINT daily_reports_user_id_work_date_key UNIQUE (user_id, work_date);
      RAISE NOTICE 'UNIQUE 制約 (user_id, work_date) を追加しました。';
    END IF;
  END IF;
END $$;


-- ------------------------------------------------------------
-- 3. handle_new_user トリガーの堅牢化
--
--    - search_path が未設定だった（Supabase のリンター警告）
--    - user_metadata の role をそのまま採用していたため、
--      サインアップを開放した場合に自己昇格が可能だった。
--      role は必ず 'employee' で作成し、昇格は管理 API 側の
--      upsert（service role 経由）でのみ行う。
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'employee'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ------------------------------------------------------------
-- 4. payslips の DELETE ポリシー（管理者のみ）
--    これまで DELETE ポリシーが無く、管理者でも削除できなかった。
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "payslips_delete_admin" ON public.payslips;
CREATE POLICY "payslips_delete_admin" ON public.payslips
  FOR DELETE USING (public.check_is_admin());
