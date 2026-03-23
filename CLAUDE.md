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
- a cycle commute dashboard with charts, photos, and segment analysis

## Tech Stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Backend: Node.js Vercel serverless functions
- Deployment: Vercel
- External APIs:
  - Strava
  - OpenAI (`gpt-4o` in `api/generateSwimPlan.js`)
  - Airtable
- Client-side libraries loaded by page where needed:
  - Chart.js
  - Leaflet
  - Google Fonts (`Inter`)

## Repository Structure

```text
/
|-- index.html                       # Site landing page
|-- login.html                       # Password entry page
|-- auth.js                          # Client-side auth bootstrap and redirects
|-- nav.css                          # Shared navigation styles
|-- shared.css                       # Shared design tokens / styles
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
|   `-- cyclecommute.html            # Cycle commute dashboard
|
|-- api/
|   |-- auth.js                      # Auth endpoint: ?action=status|login|logout
|   |-- browseSwimPlans.js           # Filter / sort / paginate swim plans
|   |-- generateSwimPlan.js          # OpenAI-backed plan generation
|   |-- get-swims.js                 # Recent swim activities from Strava
|   |-- get-rides.js                 # Commute rides from Strava
|   |-- get-ride-photos.js           # Photos for commute rides
|   |-- get-segment-times.js         # Segment efforts across commute rides
|   |-- get-segment-detail.js        # Segment geometry / metadata
|   |-- getPools.js                  # Pool data from Airtable
|   `-- lib/
|       |-- auth-utils.js            # Shared cookie / session helpers
|       |-- strava.js                # Shared token refresh + pagination helpers
|       `-- templates.js             # Shared loader for data/templates.v2.json
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
|   `-- check-template-bundle.js     # Legacy Netlify/v1 checker; currently stale
|
|-- vercel.json                      # Vercel config
`-- package.json                     # Node dependencies
```

## Architecture Notes

### Navigation
- Navigation HTML is injected by `components/nav.js`
- Do not hand-write inline nav markup into pages
- Sports pages get a second sub-nav automatically
- Pages in the sports section should account for both nav bars with `padding-top: 124px`
- Non-sports pages use `padding-top: 80px`

### Authentication
- The whole site is guarded by client-side auth bootstrap in `auth.js`
- Login page: `/login.html`
- Auth API endpoint: `/api/auth?action=status|login|logout`
- Auth can be disabled by setting `AUTH_ENABLED=false`

### Frontend
- Pages are mostly self-contained HTML files with inline `<style>` and `<script>` blocks
- Cross-page dependencies are intentionally light
- Absolute paths are preferred for links and assets:
  - `/sports/calculator.html`
  - `/nav.css`
  - `/images/...`

### Backend
- Vercel functions live in `api/`
- Functions are CommonJS modules
- Most functions proxy external APIs and add light filtering / caching
- Reuse helpers in `api/lib/` instead of duplicating Strava or template-loading logic

### Swim Plan Data
- `data/templates.v2.json` is the live bundle used by the swim plan library
- `api/lib/templates.js` loads and caches that bundle
- The checked-in dataset is generated from `.docx` files in `swim_templates/source/`
- The current checked-in bundle was generated on `2026-02-10` and contains 401 plans

## Running Locally

Install dependencies:

```bash
npm install
```

Run the site and serverless functions locally:

```bash
vercel dev
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

Optional:

| Variable | Purpose |
|----------|---------|
| `AUTH_ENABLED` | Set to `false` to bypass the password gate |

## Code Conventions

### HTML Pages
- Keep pages standalone and simple
- Include `nav.css` and `components/nav.js` on navigable pages
- Do not add a page-local `toggleMenu()` implementation; the nav component owns that behavior

### JavaScript
- Vanilla JS only
- Prefer `document.getElementById()` / `querySelector()` over abstractions
- Escape user-controlled data before injecting into `innerHTML`

### Serverless Functions
- Use `node-fetch` v2 for outbound requests
- Respond with `res.status(...).json(...)` or `res.status(...).send(...)`
- Module-scope caching is acceptable for expensive upstream calls
- For Strava endpoints, prefer `api/lib/strava.js`
- For template data, prefer `api/lib/templates.js`

## Common Tasks

### Add a new sports page
1. Create the HTML file in `sports/`
2. Link `/nav.css` and `/components/nav.js`
3. Use `padding-top: 124px`
4. Add the page to `sportsSubLinks` in `components/nav.js`

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

## Notes on Stale Artifacts

- `scripts/check-template-bundle.js` still references the older Netlify / `templates.v1.json` setup
- The live site uses Vercel, `api/`, and `data/templates.v2.json`
- If you need to touch template tooling, prefer the v2 ingestion flow unless explicitly asked to revive the legacy path
