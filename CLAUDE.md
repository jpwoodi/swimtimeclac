# CLAUDE.md

This file provides guidance for AI assistants working with the **swimtimecalc** codebase.

## Project Overview

A personal website covering work, music and sports. The sports section includes swim time/pace calculators, training dashboards, pool finders, and AI-powered workout plan generation. Built as a static site with Vercel serverless functions.

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework)
- **Backend:** Node.js serverless functions (Vercel Functions)
- **Deployment:** Vercel (auto-deploys from git)
- **External APIs:** Strava (activity data), OpenAI GPT-4o-mini (swim plans), Airtable (pool data)
- **Libraries (CDN):** Chart.js, Leaflet (maps), Google Fonts (Inter)

## Repository Structure

```
/
├── index.html                         # Personal landing page (Work, Music, Sports)
├── nav.css                            # Shared navigation bar styles
├── shared.css                         # Design tokens (CSS custom properties) + common styles
├── images/                            # Image assets (icons, markers, favicons)
│
├── components/
│   └── nav.js                         # Shared navigation component (injected into all pages)
│
├── work/
│   ├── index.html                     # Work section landing page
│   ├── article-template.html          # Template for new articles
│   ├── articles.js                    # Article metadata registry
│   └── articles/
│       └── YYYY-MM-DD-slug.html       # Individual article pages
│
├── music/
│   └── index.html                     # Music section landing page
│
├── sports/
│   ├── index.html                     # Sports section landing page (tool grid)
│   ├── calculator.html                # Swim time/pace calculator
│   ├── css.html                       # Critical Swim Speed calculator
│   ├── pools.html                     # Pool finder with interactive map
│   ├── stravafeed.html                # Strava swim activity feed
│   ├── swim-plan-generator.html       # AI-powered swim plan generator
│   ├── swim-plan-library.html         # Browse AI swim plan library
│   └── cyclecommute.html              # Cycle commute tracker
│
├── api/
│   ├── auth-login.js                  # Authentication login endpoint
│   ├── auth-logout.js                 # Authentication logout endpoint
│   ├── auth-status.js                 # Authentication status check
│   ├── browseSwimPlans.js             # Browse swim plan library
│   ├── generateSwimPlan.js            # OpenAI swim plan generation
│   ├── get-rides.js                   # Fetch cycle rides from Strava
│   ├── get-swims.js                   # Fetch swim activities from Strava
│   ├── getPools.js                    # Fetch pool data from Airtable
│   └── lib/
│       ├── auth-utils.js              # Shared auth utilities
│       ├── strava.js                  # Shared Strava token refresh + pagination helper
│       └── templates.js               # Shared swim plan template loader (templates.v2.json)
│
├── data/
│   └── templates.v2.json              # Swim plan template dataset
├── vercel.json                        # Vercel deployment config
└── package.json                       # Node.js dependencies
```

## Site Architecture

### Navigation
- **Primary nav** (all pages): Home | Work | Music | Sports
- **Sub-nav** (sports section only): Overview | Swim Calculator | CSS Calculator | Pool Finder | Swim Feed | AI Swim Plan | Swim Plans | Cycle Commute
- Nav HTML is injected by `/components/nav.js` — **never write inline nav HTML manually**
- `nav.js` auto-detects the current path to set active states and show/hide the sports sub-nav
- Styles for the nav live in `nav.css` (linked via absolute path `/nav.css`)
- Pages with sports sub-nav use `padding-top: 124px` (56px primary + 44px sub-nav + 24px spacing)
- Pages without sub-nav use `padding-top: 80px`

### Sections
- **Work** (`/work/`): Articles and project write-ups
- **Music** (`/music/`): Playlists, gigs and music content (placeholder)
- **Sports** (`/sports/`): All swim/cycle tools and dashboards

### Frontend
- Standalone HTML pages with inline CSS/JS
- Navigation injected via `components/nav.js` (shared, no inline nav HTML in pages)
- Design tokens available as CSS custom properties in `shared.css` (link if needed)
- Client-side calculations for pace, distance, and SWOLF metrics
- Chart.js for time-series dashboard visualizations
- Leaflet + OpenStreetMap for interactive pool maps
- Stripe-inspired design system (see Design Tokens below)

### Backend (Vercel Functions)
- Stateless serverless functions at `api/`
- Act as API proxies between frontend and external services
- In-memory caching with 1-hour TTL and force-refresh support
- CORS enabled for all function endpoints (configured in `vercel.json`)
- Shared utilities in `api/lib/` — use these instead of duplicating logic

### Data Flow
- **Strava integration:** `api/lib/strava.js` handles token refresh + pagination; `get-swims.js` and `get-rides.js` each pass a filter function to `createStravaHandler()`
- **AI plans:** User input -> prompt construction with retrieved templates -> OpenAI chat completion -> parse response -> display
- **Pool finder:** Airtable data -> fetch -> display on Leaflet map
- No database; all persistent data lives in Airtable or external services

## Development Workflow

### Running Locally

Install dependencies:
```bash
npm install
```

For local development with Vercel Functions:
```bash
vercel dev
```

This serves the static site and makes serverless functions available at `/api/*`.

### Environment Variables Required

The following must be set in Vercel (or `.env` for local dev):

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

### Deployment

Push to the main branch triggers automatic Vercel deployment. No build step is needed — the site is served as static files with serverless functions.

## Code Conventions

### Path Conventions
- All inter-page links use absolute paths (e.g. `/sports/calculator.html`, `/nav.css`)
- Images referenced via `/images/` from any page
- Vercel function URLs use `/api/<name>` (absolute, works from any path)

### HTML Pages
- Each page is self-contained with embedded `<style>` and `<script>` blocks
- Navigation is injected by adding `<script src="/components/nav.js"></script>` in `<head>` — no inline nav HTML
- Do NOT add a `toggleMenu()` function to pages; it is handled by `nav.js`
- Mobile-responsive; hamburger menu handled by `nav.js`
- All pages follow the Stripe-inspired design system

### JavaScript
- Vanilla JS (no TypeScript, no bundler, no modules)
- DOM manipulation via `document.getElementById()` / `querySelector()`
- Fetch API for all HTTP requests to serverless functions
- Client-side calculations (no server round-trips for math)
- Always escape user-controlled or external data before injecting into innerHTML (use a `escapeHtml()` helper)

### Serverless Functions
- CommonJS module format (`module.exports = async (req, res) => {}`)
- Use `node-fetch` v2 for outbound HTTP requests
- Respond with `res.status(code).json(data)` or `res.status(code).send(string)`
- Cache responses in module-scope variables with TTL logic
- Use `api/lib/strava.js` for any Strava data fetching (do not duplicate token/pagination logic)
- Use `api/lib/templates.js` for loading swim plan templates (do not duplicate `loadTemplates`)
- Request data: `req.method`, `req.body`, `req.query`, `req.headers`

### Design Tokens (Stripe-Inspired)
CSS custom properties are defined in `shared.css`. Raw values for reference:
```
--color-primary:    #635bff (purple)
--color-green:      #2e7d32
--color-orange:     #ef6c00
--color-teal:       #009688
--color-text:       #1a1f36
--color-text-secondary: #697386
--color-text-muted: #8792a2
--color-bg:         #f6f9fc
--color-surface:    #fff
--color-border:     #e3e8ee
Font:               'Inter', sans-serif
Spacing:            8px grid system
```

## Testing & Quality

- No test framework is currently configured
- No linting or formatting tools installed
- No CI/CD pipeline beyond Vercel auto-deploy
- Manual testing via browser and Vercel Dev

## Common Tasks

### Adding a new sports page
1. Create the HTML file in `sports/`
2. Add `<link rel="stylesheet" href="/nav.css">` and `<script src="/components/nav.js"></script>` in `<head>`
3. Use `padding-top: 124px` on body to account for both navbars
4. Follow the Stripe design tokens for consistent styling
5. Add the page to `sportsSubLinks` in `components/nav.js` so it appears in the sub-nav

### Adding a new work article
1. Create the HTML file in `work/articles/` following the `YYYY-MM-DD-slug.html` naming convention
2. Use `work/article-template.html` as the starting point
3. Add the article metadata to `work/articles.js` so it appears on the Work index page

### Adding a new serverless function
1. Create a `.js` file in `api/`
2. Export the handler: `module.exports = async (req, res) => { ... }`
3. Respond with `res.status(code).json(data)` or `res.status(code).send(string)`
4. For Strava data: use `createStravaHandler()` from `api/lib/strava.js`
5. For template data: use `loadTemplates()` from `api/lib/templates.js`
6. Add any new API keys as environment variables in Vercel
7. The function is automatically available at `/api/<filename>`
