// Stand-in for firebase-firestore.js, holding a nested dataset shaped like the
// real EduQuestHermes project. Lets firestore-export.html's walk be exercised
// offline, including a permission-denied path.
const DATA = {
  'submissions':                { s1:{classCode:'11SOC',student:'ALICE'}, s2:{classCode:'11SOC',student:'BOB'} },
  'sociology_survey_2026':      { r1:{q1:'yes'} },
  'qt_sessions':                { sess_1:{studentName:'CARL'} },
  'qt_classes':                 {},
  'qt_card_states':             {},
  'ta_checklist':               { state:{done:[1,2]} },
  'classes':                    { '11SOC':{name:'Year 11 Sociology'} },
  'classes/11SOC/avatars':      { Hermes:{confirmed:true} },
  'classes/11SOC/students':     { alice:{name:'alice'}, bob:{name:'bob'} },
  'classes/11SOC/students/alice/documents': { d1:{title:'Essay'} },
  'classes/11SOC/students/alice/sessions':  { '2026-09-01':{wordCount:120} },
  'classes/11SOC/students/alice/sessions/2026-09-01/snapshots': { n1:{wordCount:50}, n2:{wordCount:120} },
  'classes/11SOC/students/alice/sessions/2026-09-01/sources':   { u1:{url:'http://example.com'} },
  'classes/11SOC/students/bob/documents': {},
  'classes/11SOC/students/bob/sessions':  {}
};

const DOCS = {
  'classes/11SOC/meta/prompt':                   { text:'Write about The Merger' },
  'classes/11SOC/students/alice/meta/quotes':    { quotes:['a','b'] }
};

// Simulate a collection the rules refuse to serve.
const LOCKED = new Set(['qt_card_states']);

globalThis.__reads = [];

export function initializeApp(){ return {}; }
export function initializeFirestore(){ return {}; }
export function getFirestore(){ return {}; }
export function collection(db, ...p){ return { path: p.join('/') }; }
export function doc(db, ...p){ return { path: p.join('/') }; }

export async function getDocs(ref){
  globalThis.__reads.push(ref.path);
  if (LOCKED.has(ref.path)) throw new Error('Missing or insufficient permissions.');
  const d = DATA[ref.path];
  if (d === undefined) throw new Error('Missing or insufficient permissions.');
  const entries = Object.entries(d);
  return {
    size: entries.length,
    forEach(f){ entries.forEach(([id, v]) => f({ id, data: () => v })); }
  };
}

export async function getDoc(ref){
  globalThis.__reads.push(ref.path);
  const d = DOCS[ref.path];
  return { exists: () => d !== undefined, data: () => d };
}

export function getAuth(){ return {}; }
export async function signInWithEmailAndPassword(){ return {}; }
