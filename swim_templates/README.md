# Swim Plan Templates

This directory contains the source workout documents and ingestion scripts that power the swim-plan features on `Woodnott.com`.

The current checked-in `data/templates.v2.json` bundle contains 401 plans generated from the `.docx` files in this folder.

## Folder Structure

```text
swim_templates/
|-- source/
|   |-- mileage/         # Distance / endurance sessions
|   |-- im/              # IM and stroke sessions
|   |-- fast/            # Speed / sprint sessions
|   `-- kitchen_sink/    # Mixed sessions
|-- scripts/
|   |-- ingest_v2.py     # Current bulk-ingestion script
|   |-- ingest_v1.py     # Legacy v1 script
|   |-- run_ingest_v1.bat
|   `-- run_ingest_v1.sh
|-- MIGRATION_GUIDE.md   # Current v2 operating notes
`-- README.md            # This file
```

Current source counts in the repo snapshot:
- `mileage`: 100 files
- `im`: 100 files
- `fast`: 101 files
- `kitchen_sink`: 100 files

## Recommended Workflow

### 1. Add or update source plans

Place `.docx` files into the category folders under `swim_templates/source/`.

Recommended filename format:

```text
YYYY.MM.DD - DISTANCE - POOL_TYPE.docx
```

Example:

```text
2026.02.09 - 3200 - SCY.docx
```

This lets the ingestion script extract:
- workout date
- distance
- pool type

### 2. Run the v2 ingestion script

The repo does not currently expose an npm script for v2 ingestion, so run the Python script directly:

```bash
py swim_templates/scripts/ingest_v2.py
```

Or on macOS / Linux:

```bash
python3 swim_templates/scripts/ingest_v2.py
```

This will:
- scan all four source folders
- extract text from each `.docx`
- derive metadata such as distance, difficulty, equipment, focus areas, and pool type
- write `data/templates.v2.json`

### 3. Verify the generated bundle

Check the output file:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/templates.v2.json', 'utf8')).stats)"
```

At the time of writing, the checked-in bundle stats are:

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

### 4. Test in the site

Run the site locally with:

```bash
vercel dev
```

Then check:
- `/sports/swim-plan-library.html`
- `/api/browseSwimPlans?action=getFilterOptions`

## Metadata Produced by v2

Each plan in `data/templates.v2.json` includes:
- `plan_id`
- `plan_type_key`
- `plan_type_label`
- `source_file`
- `raw_text`
- `metadata.date`
- `metadata.distance_meters`
- `metadata.pool_type`
- `metadata.difficulty`
- `metadata.focus_areas`
- `metadata.equipment_required`
- `metadata.estimated_duration_minutes`
- `metadata.intensity`

## Example Output Shape

```json
{
  "templates": [
    {
      "plan_id": "mileage_2026.02.09_-_3200_-_scy",
      "plan_type_key": "mileage",
      "plan_type_label": "Mileage (Distance)",
      "source_file": "2026.02.09 - 3200 - SCY.docx",
      "raw_text": "300 Swim\n3 x 100 Drill / Swim...",
      "metadata": {
        "date": "2026-02-09",
        "distance_meters": 3200,
        "pool_type": "SCY",
        "difficulty": "intermediate",
        "focus_areas": ["endurance", "volume"],
        "equipment_required": ["pull_buoy", "fins"],
        "estimated_duration_minutes": 56,
        "intensity": "medium"
      }
    }
  ],
  "version": "2.0",
  "generated_at": "2026-02-10T11:41:39.446771Z",
  "stats": {
    "total_files": 401,
    "successful": 401,
    "failed": 0
  }
}
```

## Frontend / API Consumers

The v2 bundle currently powers:
- `/sports/swim-plan-library.html` via `api/browseSwimPlans.js`
- `/sports/swim-plan-generator.html` via `api/generateSwimPlan.js`

## Legacy v1 Notes

The v1 ingestion scripts are still in the repo for reference, but the current site is built around `templates.v2.json`.

There is also a legacy script at `scripts/check-template-bundle.js` that still references the old Netlify / v1 layout. Treat it as archival unless you are explicitly reviving that path.

## Dependencies

Install the Python dependency used by the ingestion script:

```bash
pip install python-docx
```

Or:

```bash
pip3 install python-docx
```

## More Detail

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for the v2 maintenance workflow, validation steps, and troubleshooting notes.
