# CLAUDE.md

This file provides guidance for AI assistants working with the **swimtimecalc** codebase.

## Project Overview

A full-stack swimming training web application that provides swim time/pace calculators, training dashboards, pool finders, and AI-powered workout plan generation. Built as a static site with Netlify serverless functions.

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework)
- **Backend:** Node.js serverless functions (Netlify Functions)
- **Deployment:** Netlify (auto-deploys from git)
- **External APIs:** Strava (activity data), OpenAI GPT-4o-mini (swim plans), Airtable (pool data), Nominatim (geocoding)
- **Libraries (CDN):** Chart.js, Leaflet (maps), Moment.js, Google Fonts (Inter)

## Repository Structure

```
/
├── index.html                     # Landing page
├── calculator.html                # Swim time/pace calculator
├── css.html                       # Critical Swim Speed calculator
├── dash.html                      # Training dashboard (charts)
├── pools.html                     # Pool finder with interactive map
├── stravafeed.html                # Strava swim activity feed
├── swim-plan-generator.html       # AI-powered swim plan generator
├── cyclecommute.html              # Cycle commute tracker
├── dashscript.js                  # Dashboard chart logic (Chart.js)
├── nav.css                        # Shared navigation bar styles
├── styles.css                     # Global styles (minimal)
├── images/                        # Image assets (icons, markers, favicons)
├── netlify/
│   └── functions/                 # Serverless API functions
│       ├── client-config.js       # Strava OAuth config endpoint
│       ├── generateSwimPlan.js    # OpenAI swim plan generation
│       ├── geocode.js             # Address geocoding via Nominatim
│       ├── get-rides.js           # Fetch cycle rides from Strava
│       ├── get-swim-plan2.js      # Legacy swim plan generator
│       ├── get-swims.js           # Fetch swim activities from Strava
│       └── getPools.js            # Fetch pool data from Airtable
├── netlify.toml                   # Netlify deployment config
└── package.json                   # Node.js dependencies
```

## Architecture

### Frontend
- **8 standalone HTML pages** with inline CSS/JS and shared navigation
- Client-side calculations for pace, distance, and SWOLF metrics
- Chart.js for time-series dashboard visualizations
- Leaflet + OpenStreetMap for interactive pool maps
- Stripe-inspired design system (see Design Tokens below)

### Backend (Netlify Functions)
- Stateless serverless functions at `netlify/functions/`
- Act as API proxies between frontend and external services
- In-memory caching with 1-hour TTL and force-refresh support
- CORS enabled for all function endpoints (configured in `netlify.toml`)

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

For local development with Netlify Functions:
```bash
npx netlify dev
```

This serves the static site and makes serverless functions available at `/.netlify/functions/*`.

### Environment Variables Required

The following must be set in Netlify (or `.env` for local dev):

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

### Deployment

Push to the main branch triggers automatic Netlify deployment. No build step is needed -- the site is served as static files with serverless functions.

## Code Conventions

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
- CommonJS module format (`module.exports.handler`)
- Use `node-fetch` v2 for outbound HTTP requests
- Return JSON with appropriate status codes and CORS headers
- Cache responses in module-scope variables with TTL logic

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
- No CI/CD pipeline beyond Netlify auto-deploy
- Manual testing via browser and Netlify Dev

## Common Tasks

### Adding a new HTML page
1. Create the HTML file in the project root
2. Include the shared nav structure and link `nav.css`
3. Follow the Stripe design tokens for consistent styling
4. Add the page link to the navigation menu in all existing pages

### Adding a new serverless function
1. Create a `.js` file in `netlify/functions/`
2. Export a `handler` async function: `module.exports.handler = async (event) => { ... }`
3. Return `{ statusCode, body: JSON.stringify(data) }`
4. Add any new API keys as environment variables in Netlify
5. The function is automatically available at `/.netlify/functions/<filename>`

### Modifying the dashboard
- Chart configuration lives in `dashscript.js`
- Dashboard page structure is in `dash.html`
- Data comes from the `get-swims` serverless function (Strava API)
