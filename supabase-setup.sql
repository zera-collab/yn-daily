-- ============================================================
-- 社内日報管理システム Supabase セットアップSQL
-- Supabase SQL Editor にこのファイルの内容を貼り付けて実行してください
-- ============================================================

-- ============================================================
-- 1. テーブル作成
-- ============================================================

-- companies テーブル
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users テーブル
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'leader', 'admin')),
  hourly_rate_default INT NOT NULL DEFAULT 0,
  company_id UUID REFERENCES public.companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- daily_reports テーブル
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INT NOT NULL DEFAULT 0,
  work_minutes INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'revision_requested')),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  hourly_rate_override INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payslips テーブル（月次明細）
CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  daily_pay_adjustment INT NOT NULL DEFAULT 0,
  other_adjustment INT NOT NULL DEFAULT 0,
  daily_paid_amount INT NOT NULL DEFAULT 0,
  has_misc_fee BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_id ON public.daily_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_work_date ON public.daily_reports(work_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON public.daily_reports(status);
CREATE INDEX IF NOT EXISTS idx_payslips_user_month ON public.payslips(user_id, month);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_payslips_updated_at
  BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Row Level Security (RLS) 有効化
-- ============================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS ポリシー
-- ============================================================

-- ---- users テーブル ----

-- 権限チェック用の関数 (Security Definer を使用して再帰を避ける)
CREATE OR REPLACE FUNCTION public.check_is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('leader', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 全ユーザーは自分の情報を読める
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- leader/admin は全ユーザーを読める
CREATE POLICY "users_select_leader_admin" ON public.users
  FOR SELECT USING (public.check_is_staff());

-- admin のみ hourly_rate_default を更新可能
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE USING (public.check_is_admin());

-- ---- companies テーブル ----

-- 誰でも SELECT 可能（ログインユーザー）
CREATE POLICY "companies_select_all" ON public.companies
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- admin のみ INSERT/UPDATE/DELETE 可能
CREATE POLICY "companies_admin_all" ON public.companies
  FOR ALL USING (public.check_is_admin());

-- ---- daily_reports テーブル ----

-- employee は自分の日報のみ SELECT 可能
CREATE POLICY "reports_select_own" ON public.daily_reports
  FOR SELECT USING (user_id = auth.uid());

-- leader/admin は全日報を SELECT 可能
CREATE POLICY "reports_select_leader_admin" ON public.daily_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('leader', 'admin')
    )
  );

-- employee は自分の日報を INSERT 可能
CREATE POLICY "reports_insert_own" ON public.daily_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- employee は自分の日報を UPDATE 可能（未承認の場合のみ）
CREATE POLICY "reports_update_own" ON public.daily_reports
  FOR UPDATE USING (
    user_id = auth.uid()
    AND status != 'approved'
    AND status != 'revision_requested'
  );

-- employee は「承認済み」の日報を「差し戻し依頼中」にのみ更新可能
CREATE POLICY "reports_revision_request_own" ON public.daily_reports
  FOR UPDATE USING (
    user_id = auth.uid()
    AND status = 'approved'
  )
  WITH CHECK (
    status = 'revision_requested'
  );

-- leader/admin は全日報の status を UPDATE 可能（承認/差戻し）
CREATE POLICY "reports_update_leader_admin" ON public.daily_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('leader', 'admin')
    )
  );

-- admin のみ日報を DELETE 可能
CREATE POLICY "reports_delete_admin" ON public.daily_reports
  FOR DELETE USING (public.check_is_admin());

-- ---- payslips テーブル ----

-- admin のみ読み書き可能
CREATE POLICY "payslips_select_admin" ON public.payslips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "payslips_insert_admin" ON public.payslips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "payslips_update_admin" ON public.payslips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ============================================================
-- 4. 初期ユーザー作成手順
-- ============================================================
-- 
-- 手順:
-- 1. Supabase Dashboard > Authentication > Users から新しいユーザーを作成
--    （Email/Passwordで作成）
-- 
-- 2. 作成されたユーザーのUUIDをコピーし、以下のSQLで public.users に登録:
--
--    INSERT INTO public.users (id, name, role, hourly_rate_default)
--    VALUES (
--      'ここにauth.usersのUUID',
--      '管理者太郎',
--      'admin',
--      1500
--    );
--
--    INSERT INTO public.users (id, name, role, hourly_rate_default)
--    VALUES (
--      'ここにauth.usersのUUID',
--      'リーダー花子',
--      'leader',
--      1200
--    );
--
--    INSERT INTO public.users (id, name, role, hourly_rate_default)
--    VALUES (
--      'ここにauth.usersのUUID',
--      '従業員次郎',
--      'employee',
--      1000
--    );
--
-- 3. role を後から変更する場合:
--    UPDATE public.users SET role = 'leader' WHERE id = 'UUID';
--
-- ============================================================

-- auth.users 作成時に自動で public.users にレコードを作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
