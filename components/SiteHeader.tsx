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
    // A match page is part of the fixtures section.
    if (href === '/') return pathname === '/' || pathname.startsWith('/match/');
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
    const pathname = usePathname();

    return (
        // Phones: brand and nav on two rows, scrolling away; sm+: one sticky row.
        <header className="z-40 border-b border-border bg-bg/85 backdrop-blur sm:sticky sm:top-0">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 sm:flex-nowrap sm:px-6">
                <Link href="/" className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold tracking-tight text-text">PredictaAI</span>
                    <span className="hidden text-xs text-text-faint sm:inline">football model</span>
                </Link>

                <nav className="-mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-1 text-sm sm:mx-0 sm:w-auto">
                    {NAV.map((item) => {
                        const active = isActive(pathname, item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${
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
