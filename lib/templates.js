const fs = require('fs');
const path = require('path');

let templatesCache = null;

function loadTemplates() {
  if (templatesCache) return templatesCache;

  const candidatePaths = [
    path.join(__dirname, '..', 'data', 'templates.v2.json'),
    path.join(process.cwd(), 'data', 'templates.v2.json'),
    path.join(__dirname, 'data', 'templates.v2.json'),
  ];

  const templatesPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!templatesPath) {
    throw new Error('Templates file not found. Please run: npm run ingest-templates-v2');
  }

  const rawData = fs.readFileSync(templatesPath, 'utf-8');
  const parsed = JSON.parse(rawData);
  if (!Array.isArray(parsed.templates)) {
    parsed.templates = [];
  }

  templatesCache = parsed;
  return parsed;
}

module.exports = { loadTemplates };
