import Link from 'next/link';

export function SiteHeader() {
    return (
        <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <Link href="/" className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold tracking-tight text-text">PredictaAI</span>
                    <span className="hidden text-xs text-text-faint sm:inline">football model</span>
                </Link>

                <nav className="flex items-center gap-1 text-sm">
                    <Link
                        href="/"
                        className="rounded-md px-2.5 py-1.5 text-text-dim transition-colors hover:text-text"
                    >
                        Fixtures
                    </Link>
                    <Link
                        href="/slip"
                        className="rounded-md px-2.5 py-1.5 text-text-dim transition-colors hover:text-text"
                    >
                        Bet slip
                    </Link>
                    <Link
                        href="/accuracy"
                        className="rounded-md px-2.5 py-1.5 text-text-dim transition-colors hover:text-text"
                    >
                        Accuracy
                    </Link>
                    <Link
                        href="/method"
                        className="rounded-md px-2.5 py-1.5 text-text-dim transition-colors hover:text-text"
                    >
                        Method
                    </Link>
                </nav>
            </div>
        </header>
    );
}
