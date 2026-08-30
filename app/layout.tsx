import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://predicta-ai-tpke.vercel.app';

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: 'PredictaAI — football match prediction model',
        template: '%s · PredictaAI',
    },
    description:
        'A calibrated statistical model for Europe’s top football leagues: match odds, goals, ' +
        'and both-teams-to-score probabilities, with a public accuracy record.',
    openGraph: {
        title: 'PredictaAI',
        description:
            'Calibrated football predictions for the Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and Eredivisie.',
        url: SITE_URL,
        siteName: 'PredictaAI',
        type: 'website',
    },
    twitter: { card: 'summary', title: 'PredictaAI', description: 'Calibrated football predictions.' },
    robots: { index: true, follow: true },
};

export const viewport: Viewport = {
    themeColor: '#0b0f14',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
            <body>
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm"
                >
                    Skip to content
                </a>
                <SiteHeader />
                <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
                    {children}
                </main>
            </body>
        </html>
    );
}
