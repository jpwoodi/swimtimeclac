# CLAUDE.md

This file provides guidance for AI assistants working with the `swimtimecalc` codebase.

## Project Overview

`swimtimecalc` is the repo behind the password-gated `Woodnott.com` site.

It is a static multi-page personal site with three top-level sections:
- `Work`: article-style writing and project notes
- `Music`: a lightweight holding page for music-related content
- `Sports`: the main product surface, containing swim and cycling tools

The sports section currently includes:
- a swim time / pace calculator
- a CSS calculator
- a London pool finder
- a Strava swim feed
- an AI swim plan generator
- a swim plan library backed by a checked-in template dataset
- a race training block generator: natural-language goal parsing plus a
  deterministic, periodized, CSS-personalized multi-week plan built from
  the same template dataset
- a cycle commute dashboard with charts, photos, and segment analysis

## Tech Stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Backend: Node.js Vercel serverless functions, plus a Vercel Edge Middleware
- Deployment: Vercel (daily crons refresh Strava snapshots into Vercel Blob)
- External APIs:
  - Strava
  - OpenAI (`gpt-4o` in `api/generateSwimPlan.js` and `api/trainingBlock.js`)
  - Airtable
  - Open-Meteo (weather enrichment for commute rides, no key required)
- Client-side libraries loaded by page where needed (version-pinned with SRI):
  - Chart.js 4.4.8
  - Leaflet 1.9.4
  - Google Fonts (`Inter`)

## Repository Structure

```text
/
|-- index.html                       # Site landing page
|-- login.html                       # Password entry page
|-- auth.js                          # Client-side auth bootstrap and redirects
|-- middleware.js                    # Edge Middleware enforcing the password gate on HTML pages
|-- nav.css                          # Shared navigation styles
|-- shared.css                       # Shared design tokens / base styles (linked by every page)
|-- images/                          # Favicons, icons, map markers
|
|-- components/
|   `-- nav.js                       # Injects top nav and sports sub-nav
|
|-- work/
|   |-- index.html                   # Work landing page
|   |-- article-template.html        # Starting point for new articles
|   |-- articles.js                  # Article metadata registry
|   `-- articles/                    # Individual article pages
|
|-- music/
|   `-- index.html                   # Music landing page
|
|-- sports/
|   |-- index.html                   # Sports landing page
|   |-- calculator.html              # Swim time / pace calculator
|   |-- css.html                     # CSS calculator
|   |-- pools.html                   # Pool finder
|   |-- stravafeed.html              # Strava swim feed
|   |-- swim-plan-generator.html     # AI swim plan generator
|   |-- swim-plan-library.html       # Browseable swim plan library
|   |-- training-block.html          # Race training block: NL goal -> periodized plan
|   `-- cyclecommute.html            # Cycle commute dashboard
|
|-- api/
|   |-- auth.js                      # Auth endpoint: ?action=status|login|logout
|   |-- browseSwimPlans.js           # Filter / sort / paginate swim plans;
|   |                                #   ?action=getPlan&planId= returns one full plan
|   |-- generateSwimPlan.js          # OpenAI-backed single-session plan generation
|   |-- trainingBlock.js             # ?action=parseGoal (OpenAI NL extraction) |
|   |                                #   generate (deterministic periodized block, no LLM) |
|   |                                #   getActiveBlock | getProfile | analyzeSession |
|   |                                #   applyAdjustment | listBlockHistory | getBlockFromHistory |
|   |                                #   deleteBlockFromHistory | renameBlockInHistory
|   |-- get-swims.js                 # Recent swim activities from Strava
|   |-- get-rides.js                 # Commute rides (blob snapshot with live fallback)
|   |-- get-ride-photos.js           # Photos for commute rides (blob snapshot)
|   |-- get-segment-times.js         # Segment efforts across commute rides (blob snapshot)
|   |-- get-segment-detail.js        # Segment geometry / metadata
|   |-- getPools.js                  # Pool data from Airtable (paginated, cached)
|   `-- sync.js                      # Cron: ?target=commute-rides|ride-photos|segment-times
|                                     #   refreshes the matching Blob snapshot
|
|-- lib/                             # Shared server-side helpers (note: root-level, not api/lib/)
|   |-- auth-utils.js                # Cookie / HMAC session token helpers
|   |-- server-security.js           # requireSiteAuth, same-origin checks, login rate limiting
|   |-- strava.js                    # Token refresh + pagination + shared handler factory
|   |-- templates.js                 # Loader/cache for data/templates.v2.json
|   |-- templateSelection.js         # Corpus scoring/selection (shared by both plan generators)
|   |-- cssPacing.js                 # CSS zone math, interval rewriting (shared by both plan generators)
|   |-- periodization.js             # Weeks-until-race -> base/build/peak/taper week-by-week plan
|   |-- raceSpecificSet.js           # Goal-pace session generator for peak/taper weeks
|   |-- trainingBlockComposer.js     # Fills a periodization plan with real + race-pace sessions
|   |-- setAnalysis.js               # Recorded swim vs prescribed session -> advisory suggestions
|   |-- trainingBlockSnapshot.js     # Blob snapshot read/write for the active training block,
|   |                                #   plus a bounded archive of every generated block
|   |-- swimmerProfile.js            # Blob snapshot read/write for the persisted CSS baseline
|   |-- weather.js                   # Open-Meteo weather enrichment
|   |-- commute-snapshot.js          # Blob snapshot read/write for commute rides
|   |-- photo-snapshot.js            # Blob snapshot read/write for ride photos
|   `-- segment-snapshot.js          # Blob snapshot read/write for segment efforts
|
|-- data/
|   `-- templates.v2.json            # Checked-in swim plan dataset
|
|-- swim_templates/
|   |-- README.md                    # Template dataset overview
|   |-- MIGRATION_GUIDE.md           # Operating / maintenance notes for v2
|   |-- source/                      # Source .docx plans by category
|   `-- scripts/                     # Python ingestion scripts
|
|-- scripts/
|   `-- ci-smoke.js                  # CI smoke test (also runnable locally)
|
|-- .github/workflows/ci.yml         # CI: syntax checks + smoke test
|-- DEPLOYMENT_CHECKLIST.md          # Manual checklist for template-dataset deploys
|-- vercel.json                      # Vercel config: crons, function limits, security headers
`-- package.json                     # Node dependencies
```

## Architecture Notes

### Navigation
- Navigation HTML is injected by `components/nav.js`
- Do not hand-write inline nav markup into pages
- Sports pages get a second sub-nav automatically
- Pages in the sports section should account for both nav bars with `padding-top: 124px`
  (nav.js then adjusts body padding dynamically)
- Non-sports pages use `padding-top: 80px`

### Authentication
- Two layers share the same HMAC-signed `__Host-` session cookie:
  - `middleware.js` (Edge Middleware) redirects unauthenticated HTML page
    requests to `/login.html`; static assets and `/api/*` pass through
  - API routes verify the cookie server-side via `lib/server-security.js`
    (`requireSiteAuth`)
- `auth.js` provides the client-side bootstrap/redirect UX on top
- Login page: `/login.html`
- Auth API endpoint: `/api/auth?action=status|login|logout`
- Auth can be disabled by setting `AUTH_ENABLED=false`

### Frontend
- Pages are mostly self-contained HTML files with inline `<style>` and `<script>` blocks
- Every page links `/shared.css` (design tokens, reset, base form/input/spinner styles);
  page-specific styles stay inline and may override it
- Cross-page dependencies are intentionally light
- Absolute paths are preferred for links and assets:
  - `/sports/calculator.html`
  - `/nav.css`
  - `/images/...`
- Page titles follow the pattern `Page — Woodnott.com`
- CDN scripts/styles (Chart.js, Leaflet) are version-pinned with SRI hashes —
  keep the pin and integrity attribute together when upgrading

### Backend
- Vercel functions live in `api/`; shared helpers live in root-level `lib/`
- Functions are CommonJS modules; `middleware.js` is ESM (edge runtime)
- Most functions proxy external APIs and add light filtering / caching
- Strava-backed endpoints prefer Vercel Blob snapshots (written by the daily
  `api/sync.js` crons, one per `?target=` configured in `vercel.json`) and
  fall back to live Strava calls, then to stale snapshots on error
- Reuse helpers in `lib/` instead of duplicating Strava, auth, or
  template-loading logic
- **This deploy is on Vercel's Hobby plan: max 12 serverless functions**
  (every file directly in `api/` counts as one, regardless of size). Before
  adding a new `api/*.js` file, check `ls api/*.js | wc -l` — if it's
  already at 12, add an `?action=`/`?target=`-style route to an existing
  file instead (see `api/auth.js`, `api/browseSwimPlans.js`,
  `api/trainingBlock.js`, `api/sync.js` for the pattern), don't just add a
  new file

### Swim Plan Data
- `data/templates.v2.json` is the live bundle used by the swim plan library
- `lib/templates.js` loads and caches that bundle
- Browse responses omit `raw_text`; the library modal fetches a single plan
  via `/api/browseSwimPlans?action=getPlan&planId=...`
- The checked-in dataset is generated from `.docx` files in `swim_templates/source/`
- The current checked-in bundle was generated on `2026-02-10` and contains 401 plans
- The corpus is a curated bank of real dated sessions spanning 2021-2026, evenly
  split across the four `plan_type_key` categories — it is **not** a continuous
  training log, so week-over-week progression can't be mined from it (see
  "Race Training Block" below)
- Two format quirks to know before writing code that reads `raw_text` or
  `metadata.distance_meters`:
  - For `pool_type: "SCY"` templates, `metadata.distance_meters` is actually
    the raw yardage — the ingestion pipeline never converts it. Use
    `lib/templateSelection.js`'s `trueDistanceMeters()` instead of the raw field.
  - Interval times in `raw_text` are mostly expressed as a row of tab-separated
    times for several generic ability groups (e.g. `"3 x 100 Drill\t1:35\t1:45\t2:00\t2:15\t:20 Rest"`),
    not the `on TIME` / `@ TIME` phrasing `lib/cssPacing.js`'s `normalizeSetIntervals`
    expects. Use `convertPaceTableText` first to collapse those to one
    swimmer-specific sendoff.

### Race Training Block
`sports/training-block.html` takes a free-text race goal ("I'm racing the
Dart 10k in 2 months...") and produces a periodized, CSS-personalized
multi-week plan. It's a two-step pipeline, and only the first step uses an LLM:

1. **`api/trainingBlock.js?action=parseGoal`** (OpenAI, `gpt-4o`, temperature 0)
   extracts structured fields (race distance, weeks until race, target time,
   CSS, sessions/week, session duration) from the free text. Every field is
   type-coerced and range-checked server-side before being returned — nothing
   the model outputs is trusted verbatim. The frontend shows the extracted
   fields as editable form inputs, not as a fait accompli.
2. **`api/trainingBlock.js?action=generate`** takes those structured fields
   and builds the actual plan with **no LLM involved**:
   - `lib/periodization.js` turns weeks-until-race into a week-by-week
     base/build/peak/taper schedule (volume ramps, deload every 4th week,
     per-week session-type mix) — this is coaching structure, not something
     extracted from the corpus.
   - `lib/trainingBlockComposer.js` fills each week: base/build sessions pull
     a real corpus session close to that week's target distance (CSS-rewritten
     via `lib/cssPacing.js`, deduplicated across the block); peak/taper "fast"
     slots use `lib/raceSpecificSet.js` to generate a goal-pace-specific
     session instead, since the corpus has nothing written for a specific
     race goal. Goal pace comes from a supplied target time, or a CSS-based
     fade-factor estimate (flagged as `estimated: true`) if none was given.

The design rationale (why deterministic composition instead of routing
everything through GPT like `api/generateSwimPlan.js` does) is that real
masters coaches already wrote good sets — the value is precise selection and
CSS-correct adaptation, not an LLM paraphrasing them.

### Post-Set Analysis (closing the loop)
Generating a plan used to be a dead end — nothing checked how a prescribed
session actually went. Now:

1. **`?action=generate` persists the block** to Vercel Blob
   (`lib/trainingBlockSnapshot.js`, mirrors the commute/photo/segment
   snapshot pattern) so there's something to compare a recorded swim
   against later. Best-effort: without `BLOB_READ_WRITE_TOKEN` the swimmer
   still gets their plan, they just can't analyze against it yet. Every
   generation is also archived independently (`archiveTrainingBlock`,
   bounded to the most recent 30) so earlier blocks aren't lost the moment
   a new one is generated — `?action=listBlockHistory` returns lightweight
   summaries and `?action=getBlockFromHistory&id=` returns one full
   archived block. Viewing an archived block on `training-block.html` is
   read-only: session analysis always runs against whichever block is
   currently active, not an arbitrary archived one, since that's the only
   one `?action=analyzeSession` can look sessions up against. Archived
   blocks can be labeled (`?action=renameBlockInHistory`) and removed
   (`?action=deleteBlockFromHistory`) independently of the active block —
   the two are separate Blob objects, so managing history never touches
   what `?action=analyzeSession` reads from.
2. **`?action=analyzeSession`** takes `{weekNumber, session,
   stravaActivityId}` — Garmin devices sync to Strava already, so this is
   just `lib/strava.js`'s `fetchActivityLaps()` plus
   `lib/setAnalysis.js`'s comparison logic. Two tiers of confidence:
   - *Session-level* (any session): total distance and overall pace vs a
     reference pace.
   - *Rep-level* (race-pace sessions only): those are the only sessions
     with an exact machine-known structure — `lib/raceSpecificSet.js`
     emits `prescribedReps` / `prescribedDistancePerRep` /
     `prescribedSwimSecondsPerRep` / `prescribedRestSeconds` /
     `prescribedLeadInDistanceM` / `prescribedLeadOutDistanceM` alongside
     the human-readable text, so analysis never re-parses its own
     generated prose. The lead-in/lead-out distances isolate the main-set
     laps out of a full recorded session (which also includes warm-up/
     build/cool-down) before grouping them into reps.
   - A CSS suggestion computed from a race-pace session inverts the same
     fade-factor relationship `lib/raceSpecificSet.js` used to derive goal
     pace from CSS in the first place (`impliedCss = actualPace /
     fadeFactor(raceDistanceM)`) — goal pace and CSS are different
     reference frames, so a naive `currentCss + paceDelta` overstates the
     implied CSS change substantially.
3. **Suggestions are advisory only** — nothing is auto-applied.
   **`?action=applyAdjustment`** writes a CSS update into
   `lib/swimmerProfile.js` only when the swimmer explicitly clicks Apply.
   That profile is what "future plans" means in practice: the training
   block page pre-fills CSS from it on load. It never rewrites an
   already-generated block.

## Running Locally

Install dependencies:

```bash
npm install
```

Run the site and serverless functions locally:

```bash
vercel dev
```

Run the CI smoke test (loads every module, validates the bundle, exercises
`browseSwimPlans`, checks periodization invariants, exercises
`trainingBlock?action=generate`, and verifies the post-set analysis math
against a synthetic recorded swim):

```bash
node scripts/ci-smoke.js
```

## Environment Variables

Required for full functionality:

| Variable | Purpose |
|----------|---------|
| `STRAVA_CLIENT_ID` | Strava API client ID |
| `STRAVA_CLIENT_SECRET` | Strava API client secret |
| `STRAVA_REFRESH_TOKEN` | Strava OAuth refresh token |
| `OPENAI_API_KEY` | OpenAI API key for swim plan generation |
| `AIRTABLE_BASE_ID` | Airtable base ID for pool data |
| `AIRTABLE_TOKEN` | Airtable personal access token |
| `SITE_PASSWORD` | Password required to unlock the site |
| `AUTH_SESSION_SECRET` | Secret used to sign auth session cookies |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token used by the snapshot sync endpoints |
| `CRON_SECRET` | Bearer secret Vercel crons send to the `api/sync-*` endpoints |

Optional:

| Variable | Purpose |
|----------|---------|
| `AUTH_ENABLED` | Set to `false` to bypass the password gate |
| `COMMUTE_SYNC_SECRET` | Additional bearer secret accepted by the sync endpoints |
| `SWIM_PLAN_DEBUG_META` | Set to `true` to include template-selection metadata in plan responses |

## Code Conventions

### HTML Pages
- Keep pages standalone and simple
- Include `nav.css`, `shared.css`, and `components/nav.js` on navigable pages
- Do not add a page-local `toggleMenu()` implementation; the nav component owns that behavior

### JavaScript
- Vanilla JS only
- Prefer `document.getElementById()` / `querySelector()` over abstractions
- Escape user-controlled data before injecting into `innerHTML`

### Serverless Functions
- Use `node-fetch` v2 for outbound requests
- Respond with `res.status(...).json(...)` or `res.status(...).send(...)`
- Module-scope caching is acceptable for expensive upstream calls
- For Strava endpoints, prefer `lib/strava.js`
- For template data, prefer `lib/templates.js`
- Gate new endpoints with `requireSiteAuth` from `lib/server-security.js`

## Common Tasks

### Add a new sports page
1. Create the HTML file in `sports/`
2. Link `/nav.css`, `/shared.css`, and `/components/nav.js`
3. Use `padding-top: 124px`
4. Add the page to `sportsSubLinks` in `components/nav.js`
5. Add a matching tool card to `sports/index.html`

### Add a new work article
1. Create a file in `work/articles/` using the `YYYY-MM-DD-slug.html` pattern
2. Start from `work/article-template.html`
3. Add metadata in `work/articles.js`

### Refresh the swim plan dataset
1. Add or update `.docx` files under `swim_templates/source/`
2. Run one of:

```bash
py swim_templates/scripts/ingest_v2.py
```

```bash
python3 swim_templates/scripts/ingest_v2.py
```

3. Confirm `data/templates.v2.json` was updated as expected
4. Test `/sports/swim-plan-library.html` and `/api/browseSwimPlans`
5. See `DEPLOYMENT_CHECKLIST.md` for the full manual checklist
