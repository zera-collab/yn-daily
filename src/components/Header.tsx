'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Role } from '@/lib/types';
import { useState } from 'react';

interface HeaderProps {
    userName: string;
    role: Role;
}

export default function Header({ userName, role }: HeaderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const navItems = getNavItems(role);

    return (
        <header className="glass sticky top-0 z-40 border-b border-slate-200/80">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between h-14">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <span className="font-semibold text-sm hidden sm:block">日報管理</span>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${pathname.startsWith(item.href)
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-slate-500 hover:text-blue-600 hover:bg-slate-50'
                                    }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    {/* User */}
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 capitalize">{role}</span>
                            <span className="text-sm font-medium text-slate-700">{userName}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-slate-200 transition-all font-medium"
                        >
                            ログアウト
                        </button>
                        {/* Mobile menu button */}
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {menuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile Nav */}
                {menuOpen && (
                    <nav className="md:hidden py-2 border-t border-slate-200/80 animate-fade-in">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMenuOpen(false)}
                                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-all ${pathname.startsWith(item.href)
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-slate-500 hover:text-blue-600 hover:bg-slate-50'
                                    }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                )}
            </div>
        </header>
    );
}

function getNavItems(role: Role) {
    const items: { href: string; label: string }[] = [];

    if (role === 'employee') {
        items.push({ href: '/employee/reports', label: '日報一覧' });
    }
    if (role === 'leader' || role === 'admin') {
        items.push({ href: '/leader/reports', label: '日報管理' });
    }
    if (role === 'admin') {
        items.push({ href: '/admin/users', label: 'ユーザー管理' });
        items.push({ href: '/admin/reports', label: '日報・時給' });
        items.push({ href: '/admin/payroll', label: '月次集計' });
    }

    return items;
}
