'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
    { href: '/', label: 'Fixtures' },
    { href: '/slip', label: 'Bet slip' },
    { href: '/accuracy', label: 'Accuracy' },
    { href: '/method', label: 'Method' },
];

function isActive(pathname: string, href: string) {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <Link href="/" className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold tracking-tight text-text">PredictaAI</span>
                    <span className="hidden text-xs text-text-faint sm:inline">football model</span>
                </Link>

                <nav className="flex items-center gap-1 text-sm">
                    {NAV.map((item) => {
                        const active = isActive(pathname, item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                                    active
                                        ? 'bg-surface-2 text-text'
                                        : 'text-text-dim hover:text-text'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}
