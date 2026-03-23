# Swim Plan Library / Site Deployment Checklist

This checklist reflects the current Vercel-based repo structure.

## Pre-Deployment

### 1. Confirm source plans
- [ ] `.docx` files are in the expected folders under `swim_templates/source/`
- [ ] filenames follow `YYYY.MM.DD - DISTANCE - POOL_TYPE.docx` where possible
- [ ] category counts look reasonable:
  - [ ] `mileage`
  - [ ] `im`
  - [ ] `fast`
  - [ ] `kitchen_sink`

### 2. Confirm Python dependency

```bash
pip install python-docx
```

Or:

```bash
pip3 install python-docx
```

### 3. Regenerate the template bundle

Windows:

```bash
py swim_templates/scripts/ingest_v2.py
```

macOS / Linux:

```bash
python3 swim_templates/scripts/ingest_v2.py
```

Verify:
- [ ] no ingestion errors
- [ ] `data/templates.v2.json` was written
- [ ] `failed` count is `0`

### 4. Validate bundle stats

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/templates.v2.json', 'utf8')).stats)"
```

Current repo snapshot example:

```json
{
  "total_files": 401,
  "successful": 401,
  "failed": 0,
  "by_type": {
    "mileage": 100,
    "im": 100,
    "fast": 101,
    "kitchen_sink": 100
  }
}
```

## Local Testing

### 1. Start local runtime

```bash
vercel dev
```

### 2. Test the browse endpoint

```bash
curl "http://localhost:3000/api/browseSwimPlans?action=getFilterOptions"
```

Check:
- [ ] request succeeds
- [ ] filter options are returned
- [ ] `totalPlans` looks correct

### 3. Test the frontend

Visit:
- `http://localhost:3000/sports/swim-plan-library.html`
- `http://localhost:3000/sports/swim-plan-generator.html`

Checklist:
- [ ] pages load without JS errors
- [ ] plan counts render
- [ ] filters populate
- [ ] search works
- [ ] sorting works
- [ ] pagination works
- [ ] plan detail modal opens and closes correctly
- [ ] generator still returns plans successfully

### 4. Smoke-test the rest of the site
- [ ] `/index.html`
- [ ] `/work/index.html`
- [ ] `/music/index.html`
- [ ] `/sports/index.html`
- [ ] `/sports/calculator.html`
- [ ] `/sports/css.html`
- [ ] `/sports/pools.html`
- [ ] `/sports/stravafeed.html`
- [ ] `/sports/cyclecommute.html`

## Navigation / Shared UI Checks

- [ ] `components/nav.js` still reflects the intended top-nav and sports sub-nav entries
- [ ] sports pages still account for dual-nav spacing (`padding-top: 124px`)
- [ ] non-sports pages still account for single-nav spacing (`padding-top: 80px`)

## Environment Variables in Vercel

- [ ] `STRAVA_CLIENT_ID`
- [ ] `STRAVA_CLIENT_SECRET`
- [ ] `STRAVA_REFRESH_TOKEN`
- [ ] `OPENAI_API_KEY`
- [ ] `AIRTABLE_BASE_ID`
- [ ] `AIRTABLE_TOKEN`
- [ ] `SITE_PASSWORD`
- [ ] `AUTH_SESSION_SECRET`

Optional:
- [ ] `AUTH_ENABLED` set appropriately for the target environment

## Git / Review Checklist

- [ ] `git status` only shows intended changes
- [ ] generated data changes were reviewed, not blindly committed
- [ ] docs were updated if behavior changed
- [ ] no Netlify-era paths were accidentally reintroduced

Suggested files to stage when updating swim plans:

```bash
git add swim_templates/
git add data/templates.v2.json
git add api/browseSwimPlans.js
git add api/generateSwimPlan.js
git add sports/swim-plan-library.html
git add sports/swim-plan-generator.html
git add CLAUDE.md
git add DEPLOYMENT_CHECKLIST.md
```

## Production Verification

After deploy:
- [ ] home page loads
- [ ] login flow behaves as expected
- [ ] swim-plan library loads
- [ ] browse endpoint responds in production
- [ ] generator endpoint responds in production
- [ ] no new console errors appear
- [ ] mobile layout still works on key pages

## Rollback

If a deploy breaks:
1. revert the offending commit
2. redeploy on Vercel
3. if needed, restore the previous `data/templates.v2.json`

## Notes

- The current site is Vercel-based, not Netlify-based
- The active template bundle is `data/templates.v2.json`
- `scripts/check-template-bundle.js` is a legacy v1 / Netlify checker and should not be used as the deployment source of truth
