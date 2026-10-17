# PredictaAI ⚽

A calibrated statistical model for the outcome, goals and both-teams-to-score
markets in Europe's top football leagues — with a **public, auto-graded accuracy
record** so the claims can be checked.

Live: <https://predicta-ai-tpke.vercel.app/>

## What it does

- **Leagues:** Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie.
- **Markets per fixture:** 1X2, Over/Under 1.5 / 2.5 / 3.5, both-teams-to-score,
  a corners estimate, a projected scoreline and the most likely scorelines.
- **Every prediction is stored when it's made and scored after the match**, then
  shown on [`/accuracy`](https://predicta-ai-tpke.vercel.app/accuracy) with hit
  rates, Brier scores and a calibration chart. Nothing is back-fitted.

## How the model works

Full write-up at [`/method`](https://predicta-ai-tpke.vercel.app/method). In short:

1. **Venue-aware strength** — attack/defence ratings from the home and away
   league tables, normalised to the division average, shrunk hard toward the
   mean (a 40-game prior — the backtest found table rates are a noisy read).
2. **Dixon-Coles goal model** — a bivariate Poisson with the low-scoring-draw
   correction. Every market is read off one score matrix, so the numbers are
   mutually consistent.
3. **Elo** — seeded from the table, refined by replaying this season's results;
   the 1X2 blends it 70/30 with the goal model.
4. **Form & head-to-head** nudge the expected-goals figures.
5. **Enrichment** — for imminent fixtures, within a strict daily API budget,
   live form and the provider's own probabilities from API-Football are blended
   in. Those fixtures are marked *Enriched*; the rest run on *Core data*.
6. **Calibration** — once ~150 predictions have been graded, a recalibration
   curve learned from that log (the model's *raw* home/draw/away probabilities vs
   how often each actually landed) is relearned on every rebuild and folded back
   into the 1X2 output; corners get their own curves. Goals and BTTS aren't
   recalibrated yet. Confidence is the sharpness of the distribution scaled by
   data quality.

The model's tunable constants live in `lib/prediction/params.ts` and are fitted
by the backtest, not picked by hand — see below.

**Realistic accuracy:** ~53–56% on match outcomes, ~58–68% on goals/BTTS.
Corners start as a proxy off expected goals; once both sides have a few graded
games, each team's real corners-for/against history (from API-Football match
stats) is blended into the line. Still the least reliable market. Corners are
also graded on the /accuracy page, for fixtures matched to API-Football before
kickoff. Anyone advertising much higher is not measuring honestly.

## Tech

- **Next.js 16** (App Router, RSC, ISR) · React 19 · TypeScript · Tailwind v4
- **Football-Data.org v4** — fixtures, home/away tables, form, head-to-head, results
- **API-Football** — optional enrichment (live form, provider probabilities) and
  the corner counts used to grade the corners markets
- **Upstash Redis / Vercel KV** — shared API cache + prediction log
- **Vercel Cron** — daily grading of finished matches (Hobby-plan cron limit)

Data is fetched and predicted **once on the server** and cached; the browser
never calls a football API and never runs the model.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `FOOTBALL_DATA_API_KEY` | yes | [football-data.org](https://www.football-data.org/client/register), free tier (10 req/min) |
| `API_FOOTBALL_KEY` | no | Direct [api-football.com](https://dashboard.api-football.com) key — current season, 100 req/day. **Preferred.** |
| `RAPIDAPI_KEY` | no | API-Football via RapidAPI. The free RapidAPI plan only exposes seasons 2021-2023, so enrichment is effectively disabled with it. |
| `CRON_SECRET` | for `/accuracy` | Any random string; also set it as a Vercel env var. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | prod | From a Vercel KV / Upstash store. Dev falls back to `.cache/kv.json`. |
| `NEXT_PUBLIC_SITE_URL` | no | Canonical URL for metadata. |

> **Security:** the previously committed keys used a `NEXT_PUBLIC_` prefix and
> should be **rotated**. Keys are now server-only.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests plus grading/storage tests against a throwaway file store (`node --test`; needs Node 22+) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run backtest` | Replay past seasons through the model and fit its constants (see below) |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a production
build on every push to `main` and every pull request — with no secrets, so it
never touches the live KV store or API budgets.

## Grading

`GET/POST /api/cron/grade` (auth: `Authorization: Bearer $CRON_SECRET`) scans
pending predictions and curated slips, fetches final scores for matches that
have finished (one batched lookup), scores each market, and folds the result
into the rolling stats behind `/accuracy`. Grading is idempotent, so an
overlapping run can't count a match twice. After responding it warms the page
caches and logs the day's preset slips (one per preset, live prices only).
`vercel.json` runs it once a day at ~04:00 UTC — the Vercel Hobby cron limit —
which is enough to clear the previous day's fixtures. Trigger it manually any
time:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://predicta-ai-tpke.vercel.app/api/cron/grade
```

Every market is scored three ways: hit rate (which side of 50% the forecast
fell), and Brier and log loss (how good the probability itself was). Each graded
match is folded into three aggregates — all-time, its model version, and its
kickoff day — so `/accuracy` can show all time, the last 90 days, or the live
model on its own.

**Model vs the market.** Every odds build logs the bookmaker market's implied
probabilities (margin removed) for the fixtures it prices, refreshed toward the
closing line until kickoff. At grading, the model and the market are scored on
the same fixtures — the honest benchmark for a betting-adjacent model.

## Backtest

```bash
npm run backtest                                   # train on last season, test on this one
npm run backtest -- --seasons 2024,2025,2026       # more history
npm run backtest -- --no-fit --params rho=-0.1     # score an alternative without fitting
```

The backtest rebuilds what the live model would have known before each finished
match of a season — tables, form, standings-seeded Elo, league averages — from
that season's results alone, predicts it with the live code, and scores it. It
then fits the constants in `lib/prediction/params.ts` by coordinate descent on
log loss (1X2 + over 2.5 + BTTS) over the training seasons, and reports both
parameter sets on a held-out season next to a base-rate benchmark. One
football-data.org call per league-season, cached under `.cache/backtest/`.
Only adopt fitted values when they win on the held-out season. Not replayed:
head-to-head and API-Football enrichment, which have no history.

## Project layout

```
app/            routes: / (ISR), /accuracy, /method, /api/cron/grade
components/     UI (server + client); MatchExplorer does client-side filter/sort only
lib/
  prediction/   the model — poisson, strength, elo, ensemble, corners, calibrate, params
  backtest/     season replay + scoring + parameter search (pure)
  matchData.ts  assembles fixtures + strength + predictions (KV-cached, per league)
  tracking.ts   prediction + market log, grading, aggregates (storage)
  grading.ts    the grading arithmetic (pure)
  scoring.ts    Brier / log loss
  kv.ts         Upstash wrapper with a filesystem fallback for dev
  leagues.ts    league config
  __tests__/    store-backed and backtest tests
scripts/        backtest.ts, KV inspection helpers
services/       footballData.ts, apiFootball.ts (server-only API clients)
types/          domain model
```

## Responsible gambling

PredictaAI publishes probabilities, not tips. Football is high-variance and
nothing here is betting advice. If you bet, only stake what you can afford to
lose — <https://www.begambleaware.org/>.

## Author

Nkosinathi Mokwana
