# Swim Plan Templates

This directory contains 1000+ real masters swim plan templates used by the Swim Plan Library.

## Folder Structure

```
swim_templates/
├── source/
│   ├── mileage/         # 250+ distance-focused sessions
│   ├── im/              # 250+ Individual Medley & stroke work sessions
│   ├── fast/            # 250+ speed & sprint-focused sessions
│   └── kitchen_sink/    # 250+ mixed sessions (combination of above)
├── scripts/
│   ├── ingest_v1.py     # Legacy: single template per category (AI generation)
│   └── ingest_v2.py     # New: bulk processing with rich metadata
├── MIGRATION_GUIDE.md   # Detailed guide for v2 system
└── README.md            # This file
```

## Quick Start (v2 - Recommended)

### 1. Add Your Plan Documents

Place multiple .docx files in each category folder:

```
swim_templates/source/
├── mileage/
│   ├── 2026.02.09 - 3200 - SCY.docx
│   ├── 2026.02.10 - 2800 - SCY.docx
│   └── ... (250+ more files)
├── im/
│   ├── 2026.02.05 - 3000 - SCY.docx
│   └── ... (250+ more files)
├── fast/
│   ├── 2026.02.06 - 3000 - SCY.docx
│   └── ... (250+ more files)
└── kitchen_sink/
    ├── 2026.02.07 - 2800 - SCY.docx
    └── ... (250+ more files)
```

**Recommended filename format:**
```
YYYY.MM.DD - DISTANCE - POOL_TYPE.docx
```

This allows automatic extraction of date, distance, and pool type metadata.

### 2. Run the Ingestion Script

```bash
npm run ingest-templates-v2
```

Or directly:
```bash
python3 swim_templates/scripts/ingest_v2.py
```

This will:
- Process ALL .docx files in each category
- Extract rich metadata (distance, difficulty, equipment, focus areas)
- Generate `data/templates.v2.json` with 1000+ plans

### 3. View in the Library

Open your site and navigate to:
```
/sports/swim-plan-library.html
```

Filter, search, and browse all your plans!

## What's New in V2?

### Rich Metadata Extraction

Each plan includes:
- **Distance** (in meters) - auto-detected from filename or content
- **Difficulty** - auto-classified (beginner/intermediate/advanced/elite)
- **Pool Type** - SCY, SCM, or LCM
- **Focus Areas** - endurance, technique, speed, kick, etc.
- **Equipment** - pull_buoy, fins, kickboard, paddles, snorkel
- **Duration** - estimated session length in minutes
- **Date** - extracted from filename

### Browse-First Interface

The new frontend (`swim-plan-library.html`) provides:
- **Filtering**: by type, difficulty, distance range, pool type
- **Search**: full-text search across all plans
- **Sorting**: by date, distance, difficulty, or name
- **Pagination**: 20 plans per page (configurable)
- **Plan Preview**: click any plan to view full details

### Bulk Processing

Process hundreds or thousands of plans in one go:

```bash
$ npm run ingest-templates-v2

Swim Template Ingestion v2 (Bulk Processing)
============================================================

[MILEAGE] Processing Mileage (Distance)...
   Found 347 files
      • 2026.02.09 - 3200 - SCY.docx ... OK (3200m, intermediate)
      • 2026.02.10 - 2800 - SCY.docx ... OK (2800m, intermediate)
      ...

[IM] Processing IM (Strokes)...
   Found 289 files
      ...

✓ Successfully wrote 1043 templates
```

## Template Requirements

- Microsoft Word document format (.docx)
- Contains structured swim sets:
  - Warm-up
  - Build/prep sets
  - Main sets
  - Cool-down
- Distance notation (e.g., "4 x 100", "1 x 400")
- Equipment mentions (optional but recommended)
- Clear interval times or rest periods

## Output Format

### V2 Output: `data/templates.v2.json`

```json
{
  "templates": [
    {
      "plan_id": "mileage_2026-02-09_3200_scy",
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
  "generated_at": "2026-02-10T12:00:00Z",
  "stats": {
    "total_files": 1043,
    "successful": 1043,
    "by_type": {
      "mileage": 347,
      "im": 289,
      "fast": 201,
      "kitchen_sink": 206
    }
  }
}
```

## Legacy V1 System

The v1 system (AI generation with 4 template examples) is still available:

```bash
npm run ingest-templates  # Creates templates.v1.json
```

Use `/sports/swim-plan-generator.html` for AI-powered plan generation.

Both systems can coexist.

## Documentation

For detailed migration guide, troubleshooting, and advanced customization, see:
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

## Dependencies

```bash
pip install python-docx
```

The `python-docx` library is required to extract text from .docx files.
