import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // 未認証ユーザー → /login
    if (!user && !pathname.startsWith('/login')) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // 認証済みで /login → ルートへ（ルートがロールに応じて振り分ける）
    if (user && pathname === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    // ロールベースアクセス制御
    if (user && (pathname.startsWith('/employee') || pathname.startsWith('/leader') || pathname.startsWith('/admin'))) {
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const role = userData?.role;

        // 特定のロール向けページに別のロールが入ろうとした場合に正しい場所へ飛ばす
        if (pathname.startsWith('/admin') && role !== 'admin') {
            const url = request.nextUrl.clone();
            url.pathname = role === 'leader' ? '/leader/reports' : '/employee/reports';
            if (url.pathname !== pathname) return NextResponse.redirect(url);
        }

        if (pathname.startsWith('/leader') && (role !== 'leader' && role !== 'admin')) {
            const url = request.nextUrl.clone();
            url.pathname = '/employee/reports';
            if (url.pathname !== pathname) return NextResponse.redirect(url);
        }

        if (pathname.startsWith('/employee') && (role !== 'employee' && role !== 'leader' && role !== 'admin')) {
            // 基本全ロールが employee ページは見れる想定（または別途制限）
        }
    }



    return supabaseResponse;
}
