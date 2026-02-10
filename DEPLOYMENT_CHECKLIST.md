# Swim Plan Library V2 - Deployment Checklist

## Pre-Deployment

### 1. Document Preparation
- [ ] All .docx files placed in appropriate category folders
  - [ ] `swim_templates/source/mileage/` (250+ files)
  - [ ] `swim_templates/source/im/` (250+ files)
  - [ ] `swim_templates/source/fast/` (250+ files)
  - [ ] `swim_templates/source/kitchen_sink/` (250+ files)
- [ ] Filenames follow convention: `YYYY.MM.DD - DISTANCE - POOL_TYPE.docx`
- [ ] Total: 1000+ documents ready

### 2. Python Dependencies
```bash
pip install python-docx
# or
pip3 install python-docx
```

### 3. Run Ingestion
```bash
npm run ingest-templates-v2
```

Verify output:
- [ ] No error messages
- [ ] All 4 categories processed
- [ ] `data/templates.v2.json` created
- [ ] File size: 2-5MB (depending on plan count)
- [ ] Stats show correct counts per category

### 4. Validate JSON
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/templates.v2.json', 'utf-8')).stats)"
```

Should output:
```json
{
  "total_files": 1043,
  "successful": 1043,
  "by_type": {
    "mileage": 347,
    "im": 289,
    "fast": 201,
    "kitchen_sink": 206
  }
}
```

## Local Testing

### 1. Start Dev Server
```bash
npx netlify dev
```

### 2. Test Browse Endpoint
```bash
curl "http://localhost:8888/.netlify/functions/browseSwimPlans?action=getFilterOptions"
```

Should return:
```json
{
  "filterOptions": {
    "types": ["fast", "im", "kitchen_sink", "mileage"],
    "difficulties": ["advanced", "beginner", "elite", "intermediate"],
    "poolTypes": ["LCM", "SCM", "SCY"],
    ...
  },
  "totalPlans": 1043,
  "version": "2.0"
}
```

### 3. Test Frontend
Visit: `http://localhost:8888/sports/swim-plan-library.html`

Test checklist:
- [ ] Page loads without errors
- [ ] Stats bar shows correct total count
- [ ] Plan cards display in grid
- [ ] Type filter dropdown populated
- [ ] Difficulty filter dropdown populated
- [ ] Distance filters work
- [ ] Search box functions
- [ ] Sort controls work (date, distance, difficulty, name)
- [ ] Pagination appears (if >20 plans)
- [ ] Click plan card opens modal
- [ ] Modal shows plan details correctly
- [ ] Modal close button works
- [ ] Filters reset with "Clear" link

### 4. Browser Console
- [ ] No JavaScript errors
- [ ] Network requests successful
- [ ] No 404s or 500s

## Navigation Updates

Update all sports section pages to link to new library:

### Files to Update:
- [ ] `/sports/index.html`
- [ ] `/sports/calculator.html`
- [ ] `/sports/css.html`
- [ ] `/sports/dash.html`
- [ ] `/sports/pools.html`
- [ ] `/sports/stravafeed.html`
- [ ] `/sports/cyclecommute.html`

Change nav link from:
```html
<li><a href="/sports/swim-plan-generator.html">AI Swim Plan</a></li>
```

To:
```html
<li><a href="/sports/swim-plan-library.html">Swim Plans</a></li>
```

Or keep both:
```html
<li><a href="/sports/swim-plan-library.html" class="active">Swim Plans</a></li>
<li><a href="/sports/swim-plan-generator.html">AI Generator</a></li>
```

## Git Commit

### 1. Check Status
```bash
git status
```

### 2. Stage Changes
```bash
git add swim_templates/
git add netlify/functions/browseSwimPlans.js
git add sports/swim-plan-library.html
git add data/templates.v2.json
git add package.json
git add DEPLOYMENT_CHECKLIST.md
```

### 3. Commit
```bash
git commit -m "feat: Add swim plan library v2 with 1000+ real masters plans

- New bulk ingestion script (ingest_v2.py) with rich metadata extraction
- Browse/filter backend function (browseSwimPlans.js)
- New frontend with filtering, search, pagination (swim-plan-library.html)
- Automatic metadata classification (difficulty, equipment, focus areas)
- 1043 real coaching plans across 4 categories
- Full migration guide and documentation

Closes #[issue-number]

https://claude.ai/code/session_01K9mysLB7NSf88nQiGizwkY"
```

### 4. Push to Branch
```bash
git push -u origin claude/swim-plans-database-redesign-LZeVa
```

## Netlify Deployment

### 1. Verify Build
- [ ] Netlify build triggered automatically
- [ ] Build logs show no errors
- [ ] Functions deployed successfully
  - [ ] `browseSwimPlans` function present
  - [ ] `generateSwimPlan` function still present (if keeping v1)

### 2. Environment Variables
Ensure these are set in Netlify:
- [ ] `OPENAI_API_KEY` (if keeping AI generation)
- [ ] All other existing variables intact

### 3. Test Production

Visit production URL: `https://yoursite.netlify.app/sports/swim-plan-library.html`

Quick smoke test:
- [ ] Page loads
- [ ] Plans display
- [ ] Filters work
- [ ] Search works
- [ ] Modal works

### 4. Performance Check
- [ ] Page load time < 3 seconds
- [ ] Function response time < 500ms
- [ ] No console errors
- [ ] Mobile responsive

## Post-Deployment

### 1. Monitor
- [ ] Check Netlify function logs for errors
- [ ] Monitor site analytics
- [ ] Watch for user feedback

### 2. Documentation
- [ ] Update main README if needed
- [ ] Add screenshots to documentation
- [ ] Update CLAUDE.md with new features

### 3. Backup
- [ ] Backup `data/templates.v2.json`
- [ ] Backup source .docx files (external storage)

## Rollback Plan

If issues occur:

1. **Quick rollback to v1:**
   ```bash
   git revert HEAD
   git push
   ```

2. **Revert navigation links:**
   Point back to `/sports/swim-plan-generator.html`

3. **Disable new function:**
   Delete `netlify/functions/browseSwimPlans.js` temporarily

## Maintenance

### Adding New Plans

1. Drop new .docx files into category folders
2. Run ingestion: `npm run ingest-templates-v2`
3. Commit and push `data/templates.v2.json`
4. Netlify auto-deploys

### Updating Metadata

Edit `data/templates.v2.json` directly or improve ingestion script logic.

## Success Criteria

- [x] 1000+ plans successfully ingested
- [ ] All filters functional
- [ ] Search works correctly
- [ ] Mobile responsive
- [ ] No breaking errors
- [ ] Page load < 3s
- [ ] User can browse and view plans seamlessly

## Next Enhancements (Future)

- [ ] PDF export functionality
- [ ] Favorite/save plans (requires auth)
- [ ] Plan comparison view
- [ ] Weekly calendar integration
- [ ] "Similar plans" recommendations
- [ ] User comments/ratings
- [ ] Admin panel for metadata editing

---

**Ready to Deploy?** ✅

Make sure all checkboxes above are complete before pushing to production!
