import type { ReactNode } from 'react';

/** A titled panel on the match page; `id` is the in-page anchor. */
export function Section({
    id,
    title,
    description,
    children,
}: {
    id: string;
    title: string;
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className="min-w-0 scroll-mt-20 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5"
        >
            <div className="mb-3">
                <h2 id={`${id}-title`} className="text-xs font-medium uppercase tracking-wide text-text-dim">
                    {title}
                </h2>
                {description && <p className="mt-1 text-xs text-text-faint">{description}</p>}
            </div>
            {children}
        </section>
    );
}
