export function Disclaimer() {
    return (
        <footer className="mt-8 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-xs leading-relaxed text-text-faint">
            <p>
                PredictaAI publishes statistical probabilities, not tips or guarantees. Football is
                high-variance: a good model is right about match outcomes only a little more than half
                the time. The bet-slip builder is a convenience for combining selections — an
                accumulator multiplies every leg’s bookmaker margin, so more legs means worse expected
                value, not an edge. Nothing here is betting or financial advice. If you choose to bet,
                only stake what you can afford to lose — and if it stops being fun, take a break
                (<a
                    className="underline underline-offset-2"
                    href="https://www.begambleaware.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    BeGambleAware
                </a>
                ).
            </p>
        </footer>
    );
}
