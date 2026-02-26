# CLAUDE.md

This file provides guidance for AI assistants working with the **swimtimecalc** codebase.

## Project Overview

A personal website covering work, music and sports. The sports section includes swim time/pace calculators, training dashboards, pool finders, and AI-powered workout plan generation. Built as a static site with Vercel serverless functions.

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework)
- **Backend:** Node.js serverless functions (Vercel Functions)
- **Deployment:** Vercel (auto-deploys from git)
- **External APIs:** Strava (activity data), OpenAI GPT-4o-mini (swim plans), Airtable (pool data), Nominatim (geocoding)
- **Libraries (CDN):** Chart.js, Leaflet (maps), Moment.js, Google Fonts (Inter)

## Repository Structure

```
/
├── index.html                         # Personal landing page (Work, Music, Sports)
├── nav.css                            # Shared navigation bar styles
├── styles.css                         # Global styles (minimal)
├── images/                            # Image assets (icons, markers, favicons)
│
├── work/
│   └── index.html                     # Work section landing page
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
│   └── cyclecommute.html              # Cycle commute tracker
│
├── api/
│   ├── auth-login.js                  # Authentication login endpoint
│   ├── auth-logout.js                 # Authentication logout endpoint
│   ├── auth-status.js                 # Authentication status check
│   ├── browseSwimPlans.js             # Browse swim plan library
│   ├── client-config.js               # Strava OAuth config endpoint
│   ├── generateSwimPlan.js            # OpenAI swim plan generation
│   ├── geocode.js                     # Address geocoding via Nominatim
│   ├── get-cycle-commutes.js          # Alias for get-rides
│   ├── get-rides.js                   # Fetch cycle rides from Strava
│   ├── get-swim-plan2.js              # Legacy swim plan generator
│   ├── get-swims.js                   # Fetch swim activities from Strava
│   ├── getPools.js                    # Fetch pool data from Airtable
│   └── lib/
│       └── auth-utils.js              # Shared auth utilities
├── vercel.json                        # Vercel deployment config
└── package.json                       # Node.js dependencies
```

## Site Architecture

### Navigation
- **Primary nav** (all pages): Home | Work | Music | Sports
- **Sub-nav** (sports section only): Overview | Swim Calculator | CSS Calculator | Pool Finder | Swim Feed | AI Swim Plan | Cycle Commute
- Styled via `nav.css` (shared across all pages via absolute path `/nav.css`)
- Pages with sub-nav use `padding-top: 124px` (56px primary + 44px sub-nav + 24px spacing)
- Pages without sub-nav use `padding-top: 80px`

### Sections
- **Work** (`/work/`): Articles and project write-ups (placeholder for now)
- **Music** (`/music/`): Playlists, gigs and music content (placeholder for now)
- **Sports** (`/sports/`): All existing swim/cycle tools and dashboards

### Frontend
- Standalone HTML pages with inline CSS/JS and shared navigation
- Client-side calculations for pace, distance, and SWOLF metrics
- Chart.js for time-series dashboard visualizations
- Leaflet + OpenStreetMap for interactive pool maps
- Stripe-inspired design system (see Design Tokens below)

### Backend (Vercel Functions)
- Stateless serverless functions at `api/`
- Act as API proxies between frontend and external services
- In-memory caching with 1-hour TTL and force-refresh support
- CORS enabled for all function endpoints (configured in `vercel.json`)

### Data Flow
- **Strava integration:** OAuth token refresh -> fetch activities -> filter by type -> cache -> serve
- **AI plans:** User input -> prompt construction -> OpenAI chat completion -> parse response -> display
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
| `CLIENT_ID_STRAVA` | Strava client ID (frontend OAuth) |
| `REDIRECT_URI_STRAVA` | Strava OAuth redirect URI |
| `SITE_PASSWORD` | Password required to unlock the site |
| `AUTH_SESSION_SECRET` | Secret used to sign auth session cookies |

### Deployment

Push to the main branch triggers automatic Vercel deployment. No build step is needed -- the site is served as static files with serverless functions.

## Code Conventions

### Path Conventions
- All inter-page links use absolute paths (e.g. `/sports/calculator.html`, `/nav.css`)
- Images referenced via `/images/` from any page
- Vercel function URLs use `/api/<name>` (absolute, works from any path)

### HTML Pages
- Each page is self-contained with embedded `<style>` and `<script>` blocks
- Shared navigation via consistent HTML structure styled by `nav.css`
- Mobile-responsive with hamburger menu navigation
- All pages follow the Stripe-inspired design system

### JavaScript
- Vanilla JS (no TypeScript, no bundler, no modules)
- DOM manipulation via `document.getElementById()` / `querySelector()`
- Fetch API for all HTTP requests to serverless functions
- Client-side calculations (no server round-trips for math)

### Serverless Functions
- CommonJS module format (`module.exports = async (req, res) => {}`)
- Use `node-fetch` v2 for outbound HTTP requests
- Respond with `res.status(code).json(data)` or `res.status(code).send(string)`
- Cache responses in module-scope variables with TTL logic
- Request data: `req.method`, `req.body`, `req.query`, `req.headers`

### Design Tokens (Stripe-Inspired)
```
Primary:     #635bff (purple)
Secondary:   #ef6c00 (orange), #2e7d32 (green), #009688 (teal)
Text dark:   #1a1f36
Text medium: #697386
Text light:  #8792a2
Background:  #fff, #f6f9fc
Borders:     #e3e8ee
Font:        'Inter', sans-serif
Spacing:     8px grid system
```

## Testing & Quality

- No test framework is currently configured
- No linting or formatting tools installed
- No CI/CD pipeline beyond Vercel auto-deploy
- Manual testing via browser and Vercel Dev

## Common Tasks

### Adding a new sports page
1. Create the HTML file in `sports/`
2. Include the primary nav + sports sub-nav and link `/nav.css`
3. Use `padding-top: 124px` on body to account for both navbars
4. Follow the Stripe design tokens for consistent styling
5. Add the page link to the sub-nav in all existing sports pages and `sports/index.html`

### Adding a new work or music page
1. Create the HTML file in `work/` or `music/`
2. Include the primary nav and link `/nav.css`
3. Use absolute paths for all assets (`/images/`, `/nav.css`)
4. Follow the Stripe design tokens for consistent styling

### Adding a new serverless function
1. Create a `.js` file in `api/`
2. Export the handler: `module.exports = async (req, res) => { ... }`
3. Respond with `res.status(code).json(data)` or `res.status(code).send(string)`
4. Access request data via `req.method`, `req.body`, `req.query`, `req.headers`
5. Add any new API keys as environment variables in Vercel
6. The function is automatically available at `/api/<filename>`

