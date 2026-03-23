# Swim Plan Library v2 - Operating Guide

## Status

The migration to the v2 swim-plan dataset is already complete in this repo.

This guide is now best read as a maintenance guide for:
- updating the source `.docx` library
- regenerating `data/templates.v2.json`
- validating the browse and generation flows

The current checked-in bundle contains 401 plans across four categories.

## Current Architecture

### Source data

Source plans live in:

```text
swim_templates/source/
|-- mileage/
|-- im/
|-- fast/
`-- kitchen_sink/
```

### Ingestion

The current ingestion path is:

```text
swim_templates/scripts/ingest_v2.py
```

It reads `.docx` files, extracts text and metadata, then writes:

```text
data/templates.v2.json
```

### Consumers

The generated bundle is used by:
- `api/browseSwimPlans.js`
- `api/generateSwimPlan.js`
- `sports/swim-plan-library.html`
- `sports/swim-plan-generator.html`

### Hosting / runtime

- Static pages + serverless functions are hosted on Vercel
- API routes live under `/api/*`
- The old Netlify-oriented instructions in earlier versions of this doc are no longer current

## Workflow for Adding or Updating Plans

### Step 1: Add source documents

Drop new `.docx` files into the appropriate source folder.

Recommended filename pattern:

```text
YYYY.MM.DD - DISTANCE - POOL_TYPE.docx
```

Examples:
- `2026.02.09 - 3200 - SCY.docx`
- `2025.06.20 - 2800 - LCM.docx`

Metadata that can be inferred from the filename:
- date
- distance
- pool type

### Step 2: Run ingestion

On Windows:

```bash
py swim_templates/scripts/ingest_v2.py
```

On macOS / Linux:

```bash
python3 swim_templates/scripts/ingest_v2.py
```

Note:
- there is no current npm shortcut for v2 ingestion in `package.json`

### Step 3: Validate the output

Quick stats check:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/templates.v2.json', 'utf8')).stats)"
```

Expected shape:

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

The exact counts may change as the source library grows; the important thing is that:
- every expected file is processed
- `failed` stays at `0`
- the category counts look sensible

### Step 4: Test locally

Run:

```bash
vercel dev
```

Then verify:
- `http://localhost:3000/sports/swim-plan-library.html`
- `http://localhost:3000/api/browseSwimPlans?action=getFilterOptions`
- `http://localhost:3000/sports/swim-plan-generator.html`

## Metadata Model

Each template record includes:

```json
{
  "plan_id": "unique-id",
  "plan_type_key": "mileage|im|fast|kitchen_sink",
  "plan_type_label": "human label",
  "source_file": "filename.docx",
  "raw_text": "full extracted workout text",
  "metadata": {
    "date": "YYYY-MM-DD",
    "distance_meters": 3200,
    "pool_type": "SCY|SCM|LCM",
    "difficulty": "beginner|intermediate|advanced|elite",
    "focus_areas": ["endurance", "technique"],
    "equipment_required": ["pull_buoy", "fins"],
    "estimated_duration_minutes": 60,
    "intensity": "low|medium|high"
  }
}
```

## How the API Layer Uses v2

### Browse endpoint

`api/browseSwimPlans.js` supports:
- plan-type filtering
- difficulty filtering
- distance bounds
- pool-type filtering
- equipment / focus-area filtering
- full-text search over `raw_text`
- sorting
- pagination

Relevant routes:

```text
/api/browseSwimPlans
/api/browseSwimPlans?action=getFilterOptions
```

### Generator endpoint

`api/generateSwimPlan.js` loads the v2 dataset through `api/lib/templates.js` and uses retrieved examples to build the OpenAI prompt.

Current implementation detail:
- the model configured in code is `gpt-4o`

## Troubleshooting

### "Templates file not found"

Cause:
- `data/templates.v2.json` has not been generated yet

Fix:

```bash
py swim_templates/scripts/ingest_v2.py
```

Or:

```bash
python3 swim_templates/scripts/ingest_v2.py
```

### `python-docx` import error

Install the dependency:

```bash
pip install python-docx
```

### Plans do not appear in the frontend

Check:
1. `data/templates.v2.json` exists
2. the JSON parses cleanly
3. `vercel dev` is running
4. `/api/browseSwimPlans?action=getFilterOptions` returns data
5. browser console shows no request failures

### Metadata is missing or odd

Check:
1. filename format
2. extracted document text
3. any unusual formatting inside the `.docx`

If needed, improve the classification logic in `swim_templates/scripts/ingest_v2.py` and re-run ingestion.

## Legacy v1 Context

Legacy v1 artifacts remain in the repo:
- `swim_templates/scripts/ingest_v1.py`
- `swim_templates/scripts/run_ingest_v1.*`
- `scripts/check-template-bundle.js`

They are not part of the main live site flow today.

## Suggested Maintenance Routine

1. Add or rename source `.docx` files.
2. Run `ingest_v2.py`.
3. Validate `data/templates.v2.json`.
4. Test the library page and generator locally with `vercel dev`.
5. Commit the updated source docs, generated bundle, and any ingestion tweaks together.
