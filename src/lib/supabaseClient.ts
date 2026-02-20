import { createBrowserClient } from '@supabase/ssr';

// NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を参照
// SSR対応のブラウザクライアントを使用することで、認証情報のクッキー同期を確実に行います
export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
