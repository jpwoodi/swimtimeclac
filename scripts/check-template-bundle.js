const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const netlifyTomlPath = path.join(repoRoot, 'netlify.toml');
const templatesJsonPath = path.join(repoRoot, 'data', 'templates.v1.json');
const functionPath = path.join(repoRoot, 'netlify', 'functions', 'generateSwimPlan.js');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(netlifyTomlPath)) {
  fail('netlify.toml is missing');
}

if (!fs.existsSync(templatesJsonPath)) {
  fail('data/templates.v1.json is missing');
}

if (!fs.existsSync(functionPath)) {
  fail('netlify/functions/generateSwimPlan.js is missing');
}

const toml = fs.readFileSync(netlifyTomlPath, 'utf8');
const hasFunctionsBlock = /\[functions\]/m.test(toml);
const includesTemplateFile = /included_files\s*=\s*\[[^\]]*["']data\/templates\.v1\.json["'][^\]]*\]/ms.test(toml);

if (!hasFunctionsBlock) {
  fail('netlify.toml is missing [functions] block');
}

if (!includesTemplateFile) {
  fail('netlify.toml [functions].included_files does not include data/templates.v1.json');
}

const functionCode = fs.readFileSync(functionPath, 'utf8');
if (!functionCode.includes('templates.v1.json')) {
  fail('generateSwimPlan.js does not reference templates.v1.json');
}

console.log('PASS: Netlify template bundle configuration looks correct');
