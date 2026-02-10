# Swim Plan Templates

This directory contains real masters swim plan templates used to anchor the AI swim coach.

## Folder Structure

```
swim_templates/
├── source/
│   ├── mileage/         # Distance-focused sessions (Mileage Mondays)
│   ├── im/              # Individual Medley & stroke work sessions
│   ├── fast/            # Speed & sprint-focused sessions
│   └── kitchen_sink/    # Mixed sessions (combination of above)
├── scripts/
│   └── ingest_v1.py     # Python script to extract text from .docx files
└── README.md            # This file
```

## How to Add Templates

1. Place **exactly one .docx file** in each of the four session type folders:
   - `source/mileage/` - Distance-focused swim plan template
   - `source/im/` - IM and stroke work template
   - `source/fast/` - Speed and sprint template
   - `source/kitchen_sink/` - Mixed/varied session template

2. Run the ingestion script to extract text and generate JSON:
   ```bash
   npm run ingest-templates
   ```
   Or directly:
   ```bash
   python3 swim_templates/scripts/ingest_v1.py
   ```

3. This will create `data/templates.v1.json` that the serverless function will load.

## Template Requirements

- Each template should be a Microsoft Word document (.docx)
- Templates should contain typical swim sets with:
  - Warm-up sets
  - Build sets
  - Main sets
  - Cool-down sets
  - Distances in metres
  - Equipment notes (pull buoys, kickboards, fins, etc.)

## Output

The ingestion script creates `data/templates.v1.json` with the following schema:

```json
{
  "templates": [
    {
      "plan_type_key": "mileage",
      "plan_type_label": "Mileage Mondays",
      "source_file": "example.docx",
      "raw_text": "...extracted paragraph and table text..."
    }
  ]
}
```

This JSON is loaded by the Netlify function and injected into the OpenAI prompt to guide the AI coach in reusing real-world set structures.
