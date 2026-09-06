import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SDK  = pathToFileURL(path.join(HERE, 'fake-sdk.mjs')).href;
// eduquest-backend.js is a classic script; copy it to .cjs so require() takes it
const BACKEND = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'eq-')), 'backend.cjs');
fs.copyFileSync(path.join(HERE, '..', '..', 'eduquest-backend.js'), BACKEND);
const require = createRequire(import.meta.url);

let pass=0, fail=0;
const check=(n,c)=>{ c?pass++:fail++; console.log((c?'  PASS  ':'  FAIL  ')+n); };
const OK   = () => ({ data:null, error:null });
const FAIL = () => ({ data:null, error:{ message:'Failed to fetch' } });

function load(store, behaviour){
  globalThis.__calls = [];
  globalThis.__behaviour = behaviour;
  const listeners = {};
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  globalThis.addEventListener = (e,f)=>{ (listeners[e]=listeners[e]||[]).push(f); };
  globalThis.__fireOnline = ()=> (listeners.online||[]).forEach(f=>f());
  delete require.cache[require.resolve(BACKEND)];
  delete globalThis.EduQuest;
  require(BACKEND);
  const EQ = globalThis.EduQuest;
  EQ._config.sdk = SDK;
  return EQ;
}

console.log('\n--- 1. A save that succeeds ---');
{
  const store={}; const EQ=load(store, OK);
  EQ.init({url:'https://fake.supabase.co', anonKey:'k'});
  const res = await EQ.savePost({classCode:'11SOC',studentName:'ALICE',wordCount:10,body:'Alice essay'});
  check('reports ok:true', res.ok===true);
  check('outbox is empty afterwards', EQ.pendingCount()===0);
  check('hit the posts table', globalThis.__calls[0].table==='posts');
  check('did NOT ask for RETURNING (would trip RLS)', globalThis.__calls[0].selected!==true);
}

console.log('\n--- 2. A save that fails (wifi drops mid-lesson) ---');
let carried;
{
  const store={}; const EQ=load(store, FAIL);
  EQ.init({url:'https://fake.supabase.co', anonKey:'k'});
  const seen=[]; EQ.onStatus(s=>seen.push(s.state));
  const res = await EQ.savePost({classCode:'11SOC',studentName:'BOB',wordCount:99,body:'Bob essay'});
  check('does NOT report ok', res.ok===false);
  check('reports queued instead', res.queued===true);
  check('work retained in outbox', EQ.pendingCount()===1);
  check('emitted an error (not a silent catch)', seen.includes('error'));
  check('never claimed "saved"', !seen.includes('saved'));
  check('essay text intact in storage',
        JSON.parse(store['eduquest_outbox_v1'])[0].row.body==='Bob essay');
  carried = store;
}

console.log('\n--- 3. Next page load, network restored ---');
{
  const EQ = load(carried, OK);
  check('work survived the reload', EQ.pendingCount()===1);
  EQ.init({url:'https://fake.supabase.co', anonKey:'k'});
  await new Promise(r=>setTimeout(r,80));
  check('outbox drained', EQ.pendingCount()===0);
  check("Bob's essay actually reached the server",
        globalThis.__calls.some(c=>c.row&&c.row.body==='Bob essay'));
}

console.log('\n--- 4. writing_sessions still asks for its id ---');
{
  const store={}; const EQ=load(store, ()=>({data:{id:'sess-1'},error:null}));
  EQ.init({url:'https://fake.supabase.co', anonKey:'k'});
  await EQ.saveWritingSession({studentId:'s1',sessionDate:'2026-09-06',body:'x',wordCount:1});
  check('requests RETURNING (authenticated table)', globalThis.__calls[0].selected===true);
}

console.log('\n--- 5. Multiple queued items all flush ---');
{
  const store={}; const EQ=load(store, FAIL);
  EQ.init({url:'https://fake.supabase.co', anonKey:'k'});
  await EQ.savePost({classCode:'11SOC',studentName:'A',wordCount:1,body:'one'});
  await EQ.savePost({classCode:'11SOC',studentName:'B',wordCount:1,body:'two'});
  await EQ.saveSubmission({classCode:'11SOC',student:'C',lesson:'L1',flag:'green'});
  check('three items queued', EQ.pendingCount()===3);
  const EQ2 = load(store, OK);
  EQ2.init({url:'https://fake.supabase.co', anonKey:'k'});
  await new Promise(r=>setTimeout(r,150));
  check('all three drained on recovery', EQ2.pendingCount()===0);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
