# Swim Plan Library v2 - Migration Guide

## Overview

The swim plan system has been upgraded from a simple AI generation tool to a **comprehensive browseable library** with 1000+ real masters swim plans.

## What's New in V2

### 1. **Bulk Plan Processing**
- Process hundreds/thousands of .docx files automatically
- Multi-document support per category
- Rich metadata extraction

### 2. **Enhanced Metadata Schema**
```json
{
  "plan_id": "unique-identifier",
  "plan_type_key": "mileage|im|fast|kitchen_sink",
  "metadata": {
    "distance_meters": 3200,
    "difficulty": "beginner|intermediate|advanced|elite",
    "focus_areas": ["endurance", "technique"],
    "equipment_required": ["pull_buoy", "fins"],
    "estimated_duration_minutes": 60,
    "pool_type": "SCY|SCM|LCM",
    "date": "2026-02-09"
  }
}
```

### 3. **Browse-First Frontend**
- Filter by type, difficulty, distance, pool type
- Search across all plans
- Sort by date, distance, difficulty, name
- Pagination support
- Plan preview modal
- Responsive card-based design

### 4. **New Backend Functions**
- `browseSwimPlans` - Filter and paginate plans
- `getFilterOptions` - Get available filter values
- Smart query system with multiple filter parameters

## Migration Steps

### Step 1: Add Your Plan Documents

Place your .docx files in the appropriate category folders:

```
swim_templates/source/
├── mileage/       # 250+ distance-focused plans
├── im/            # 250+ IM and stroke work plans
├── fast/          # 250+ speed and sprint plans
└── kitchen_sink/  # 250+ mixed session plans
```

**Filename Convention (Recommended):**
```
YYYY.MM.DD - DISTANCE - POOL_TYPE.docx
Example: 2026.02.09 - 3200 - SCY.docx
```

This allows automatic metadata extraction.

### Step 2: Run the V2 Ingestion Script

```bash
npm run ingest-templates-v2
```

Or directly:
```bash
python3 swim_templates/scripts/ingest_v2.py
```

This will:
- Scan all four category folders
- Extract text from all .docx files
- Parse metadata from filenames
- Analyze content for equipment and focus areas
- Generate `data/templates.v2.json`

Expected output:
```
Swim Template Ingestion v2 (Bulk Processing)
============================================================

[MILEAGE] Processing Mileage (Distance)...
   Found 347 files
      • 2026.02.09 - 3200 - SCY.docx ... OK (3200m, intermediate)
      • 2026.02.10 - 2800 - SCY.docx ... OK (2800m, intermediate)
      ...

✓ Successfully wrote 1043 templates
```

### Step 3: Update Navigation Links

The new library page is at:
```
/sports/swim-plan-library.html
```

Update sub-nav in all sports pages from:
```html
<li><a href="/sports/swim-plan-generator.html">AI Swim Plan</a></li>
```

To:
```html
<li><a href="/sports/swim-plan-library.html">Swim Plans</a></li>
```

### Step 4: Test Locally

```bash
npx netlify dev
```

Visit: `http://localhost:8888/sports/swim-plan-library.html`

Test:
- ✓ Plans load correctly
- ✓ Filters work (type, difficulty, distance)
- ✓ Search functionality
- ✓ Pagination
- ✓ Plan detail modal displays correctly

### Step 5: Deploy

Commit and push to trigger Netlify deployment:

```bash
git add .
git commit -m "Add swim plan library v2 with 1000+ plans"
git push
```

## File Naming Best Practices

### Automatic Metadata Extraction

The ingestion script automatically extracts metadata from filenames:

| Pattern | Extracts | Example |
|---------|----------|---------|
| `YYYY.MM.DD` | Date | `2026.02.09` → "2026-02-09" |
| `NNNN` (4 digits) | Distance | `3200` → 3200m |
| `SCY\|SCM\|LCM` | Pool type | `SCY` → "SCY" |

**Good filename examples:**
- ✓ `2026.02.09 - 3200 - SCY.docx`
- ✓ `2026-01-15 - 2800 - SCM.docx`
- ✓ `2025.12.20 - 4000 - LCM.docx`

**Acceptable (but less metadata):**
- ⚠ `workout-3200-scy.docx` (no date)
- ⚠ `swim-plan-feb-9.docx` (no distance, no pool type)

### Content Structure

Plans should include:
- Warm-up sets
- Build/prep sets
- Main sets
- Cool-down
- Equipment callouts (pull buoy, fins, kickboard, paddles)
- Interval times or rest periods

The ingestion script will automatically detect equipment mentions in the text.

## Metadata Classification

### Difficulty Levels (Auto-classified)

Based on total distance:
- **Beginner**: < 2000m
- **Intermediate**: 2000-2999m
- **Advanced**: 3000-3999m
- **Elite**: 4000m+

You can manually adjust this in the JSON if needed.

### Focus Areas (Auto-detected)

The script detects focus areas from plan type and content:
- **From type**: mileage → endurance, im → technique, fast → speed
- **From content**: Keywords like "drill", "kick", "sprint"

### Equipment Detection

Automatically detects mentions of:
- Pull buoy / pulling
- Fins
- Kickboard / kick board
- Paddles
- Snorkel
- Ankle bands

## Troubleshooting

### "Templates file not found" error

**Cause**: `data/templates.v2.json` doesn't exist

**Solution**: Run the ingestion script:
```bash
npm run ingest-templates-v2
```

### Plans not appearing in frontend

**Check**:
1. Was ingestion successful?
2. Is `data/templates.v2.json` present and valid JSON?
3. Check browser console for errors
4. Verify Netlify function deployed correctly

### Metadata is incorrect/missing

**Solutions**:
1. Check filename format follows convention
2. Manually edit `data/templates.v2.json` to add/correct metadata
3. Re-run ingestion after fixing filenames

### Python dependency error

**Cause**: `python-docx` not installed

**Solution**:
```bash
pip install python-docx
# or
pip3 install python-docx
```

## Advanced Customization

### Custom Difficulty Classification

Edit `ingest_v2.py`, function `classify_difficulty()`:

```python
def classify_difficulty(distance_meters):
    if distance_meters < 1500:
        return "beginner"
    elif distance_meters < 2500:
        return "intermediate"
    # ... etc
```

### Add Custom Metadata Fields

1. Add field in `process_template()` function
2. Update frontend to display new field
3. Update `browseSwimPlans.js` to support filtering by new field

### Change Plan Categories

Edit `TEMPLATE_TYPES` array in `ingest_v2.py`:

```python
TEMPLATE_TYPES = [
    {
        "plan_type_key": "endurance",
        "plan_type_label": "Endurance Sessions",
        "source_folder": "swim_templates/source/endurance"
    },
    # ... add more types
]
```

## API Reference

### Browse Plans Endpoint

**GET** `/.netlify/functions/browseSwimPlans`

Query parameters:
- `type` - Filter by plan type (mileage|im|fast|kitchen_sink)
- `difficulty` - Filter by difficulty (beginner|intermediate|advanced|elite)
- `minDistance` - Minimum distance in meters
- `maxDistance` - Maximum distance in meters
- `poolType` - Filter by pool type (SCY|SCM|LCM)
- `search` - Text search in plan content
- `sortBy` - Sort field (date|distance|difficulty|name)
- `sortOrder` - Sort direction (asc|desc)
- `page` - Page number (default: 1)
- `pageSize` - Results per page (default: 20)

**Example**:
```
/.netlify/functions/browseSwimPlans?type=fast&difficulty=advanced&minDistance=3000&page=1
```

### Get Filter Options

**GET** `/.netlify/functions/browseSwimPlans?action=getFilterOptions`

Returns available filter values and statistics.

## Performance Considerations

### Large JSON Files

With 1000+ plans, `templates.v2.json` will be 2-5MB. This is acceptable for:
- Netlify Functions (50MB memory limit)
- Client-side filtering (modern browsers handle this easily)

If performance degrades:
1. Increase pagination pageSize
2. Implement server-side search indexing
3. Consider moving to Airtable database

### Caching

The browse function loads templates.v2.json on every invocation. For production optimization:

```javascript
// Add module-level caching
let cachedTemplates = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3600000; // 1 hour

function loadTemplates() {
    const now = Date.now();
    if (cachedTemplates && (now - cacheTimestamp < CACHE_TTL)) {
        return cachedTemplates;
    }

    // ... load from file
    cachedTemplates = data;
    cacheTimestamp = now;
    return cachedTemplates;
}
```

## Rollback to V1

If you need to revert to the AI-generation system:

1. Keep using `templates.v1.json` (4 templates only)
2. Use original `swim-plan-generator.html`
3. Use `generateSwimPlan.js` function

Both v1 and v2 can coexist if needed.

## Next Steps

1. **Add more plans**: Drop .docx files into category folders and re-run ingestion
2. **Enhance metadata**: Manually edit JSON for more accurate classification
3. **Add export features**: PDF export, calendar integration
4. **Build recommendation engine**: "Similar plans" suggestions
5. **User favorites**: Save favorite plans (requires authentication)

## Questions?

Check the main README or raise an issue in the repository.
