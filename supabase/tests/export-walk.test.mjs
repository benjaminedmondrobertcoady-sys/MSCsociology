/*
 * Exercises the collection walk inside firestore-export.html against a fake
 * Firestore, so the migration tool is known to reach every nested path before
 * it is ever pointed at the live project.
 *
 *   node supabase/tests/export-walk.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, '..', '..', 'firestore-export.html');
const FAKE = pathToFileURL(path.join(HERE, 'fake-firestore.mjs')).href;

// --- pull the module script out of the page and repoint its imports --------
const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('Could not find the module script in the page'); process.exit(1); }

let js = m[1].replace(
  /import\s*\{[\s\S]*?\}\s*from\s*"https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+";/g,
  ''
);
js = `import { initializeApp, getFirestore, collection, getDocs, doc, getDoc,
         initializeFirestore, getAuth, signInWithEmailAndPassword }
  from ${JSON.stringify(FAKE)};\n` + js;

// --- minimal DOM ----------------------------------------------------------
const handlers = {};
const values = { proj:'eduquesthermes-d0d7a', key:'fake-key' };
const logLines = [];

function elFor(id){
  return {
    id,
    get value(){ return values[id]; },
    set value(v){ values[id] = v; },
    set innerHTML(_){ logLines.length = 0; },
    set onclick(fn){ handlers[id] = fn; },
    appendChild(node){ logLines.push(node.textContent); },
    set scrollTop(_){}, get scrollHeight(){ return 0; },
    disabled: false, className: '', textContent: '',
    click(){}, set href(_){}, set download(_){}
  };
}
const registry = {};
globalThis.document = {
  getElementById: id => (registry[id] = registry[id] || elFor(id)),
  createElement: tag => ({ tag, textContent:'', className:'', set href(_){}, set download(_){}, click(){} })
};
globalThis.prompt = () => null;
globalThis.Blob = class { constructor(p){ this.parts = p; } };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };

// --- run ------------------------------------------------------------------
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eqexp-')), 'page.mjs');
fs.writeFileSync(tmp, js);
await import(pathToFileURL(tmp).href);

let pass = 0, fail = 0;
const check = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

await handlers['go']();

const reads = globalThis.__reads;
const output = logLines.join('\n');

console.log('\n--- paths the export actually visited ---');
console.log(reads.map(r => '  ' + r).join('\n'));
console.log('');

check('reached top-level submissions',        reads.includes('submissions'));
check('reached the survey collection',        reads.includes('sociology_survey_2026'));
check('reached quiz sessions',                reads.includes('qt_sessions'));
check('reached the TA checklist',             reads.includes('ta_checklist'));
check('reached classes',                      reads.includes('classes'));
check('descended into class avatars',         reads.includes('classes/11SOC/avatars'));
check('descended into class students',        reads.includes('classes/11SOC/students'));
check('read the class prompt doc',            reads.includes('classes/11SOC/meta/prompt'));
check('read a student quotes doc',            reads.includes('classes/11SOC/students/alice/meta/quotes'));
check('descended into student documents',     reads.includes('classes/11SOC/students/alice/documents'));
check('descended into student sessions',      reads.includes('classes/11SOC/students/alice/sessions'));
check('descended into session SNAPSHOTS',     reads.includes('classes/11SOC/students/alice/sessions/2026-09-01/snapshots'));
check('descended into session SOURCES',       reads.includes('classes/11SOC/students/alice/sessions/2026-09-01/sources'));
check('walked BOTH students, not just one',   reads.includes('classes/11SOC/students/bob/sessions'));
check('a denied collection is reported, not fatal', /PERMISSION DENIED/.test(output));
check('the run completed after the denial',   /documents exported/.test(output));

// 2 submissions + 1 survey + 1 qt_session + 1 checklist + 1 class + 1 avatar
// + 2 students + 1 document + 1 session + 2 snapshots + 1 source
// + prompt doc + quotes doc = 16
const m2 = output.match(/Done\. (\d+) documents exported/);
const counted = m2 ? Number(m2[1]) : -1;
check(`document tally is correct (got ${counted}, expected 16)`, counted === 16);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
