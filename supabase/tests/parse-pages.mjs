/*
 * Parses every <script> block in the activity pages, so a quoting or syntax
 * mistake made while rewiring shows up here rather than in front of a class.
 *
 *   node supabase/tests/parse-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAGES = [
  'eduquest-backend.js',
  'hermes.html',
  'writers-workshop-eal.html',
  'writers-workshop-eal (3).html',
  'sociology-survey-2026.html',
  'sociology-survey-results.html',
  'teacher-dashboard.html',
  'quiz-town.html',
  'index.html',
  'firestore-export.html',
  'supabase-check.html'
];

let pass = 0, fail = 0;

function checkSource(label, src, isModule) {
  try {
    if (isModule) {
      // Modules can carry import/export, which vm.Script rejects. Strip static
      // imports -- including the multi-line form -- then compile the rest.
      // Dynamic import() is left alone: it is an expression and parses fine.
      const stripped = src
        .replace(/^[ \t]*import\s+[\s\S]*?\bfrom\s*['"][^'"]+['"]\s*;?/gm, '')
        .replace(/^[ \t]*import\s*['"][^'"]+['"]\s*;?/gm, '')
        .replace(/^[ \t]*export\s+(?=(default|function|const|let|var|class)\b)/gm, '');
      new vm.Script('(async function(){' + stripped + '})');
    } else {
      new vm.Script(src);
    }
    pass++;
    return true;
  } catch (e) {
    fail++;
    console.log('  FAIL  ' + label);
    console.log('        ' + e.message.split('\n')[0]);
    return false;
  }
}

for (const page of PAGES) {
  const full = path.join(ROOT, page);
  if (!fs.existsSync(full)) { console.log('  SKIP  ' + page + ' (not found)'); continue; }
  const text = fs.readFileSync(full, 'utf8');

  if (page.endsWith('.js')) {
    if (checkSource(page, text, false)) console.log('  PASS  ' + page);
    continue;
  }

  const blocks = [...text.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) { console.log('  ----  ' + page + ' (no inline scripts)'); continue; }

  let allOk = true;
  blocks.forEach((m, i) => {
    const isModule = /type\s*=\s*["']module["']/i.test(m[1]);
    const label = `${page} [block ${i + 1}${isModule ? ', module' : ''}]`;
    if (!checkSource(label, m[2], isModule)) allOk = false;
  });
  if (allOk) console.log(`  PASS  ${page} (${blocks.length} inline block${blocks.length===1?'':'s'})`);
}

console.log(`\n  ${pass} script block(s) parsed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
