/* ==========================================================================
 * eduquest-backend.js -- shared Supabase backend for the EduQuest activities
 * ==========================================================================
 *
 * Replaces the per-file Firebase blocks that had drifted out of sync with each
 * other (three files were pointing at a misspelled project id, so their writes
 * went nowhere). One config, one place to change it.
 *
 * The central rule here: NOTHING IS EVER REPORTED AS SAVED UNTIL THE DATABASE
 * SAYS SO. Every write goes into a localStorage outbox first, synchronously,
 * before any network call. It leaves the outbox only when the server confirms
 * the row. If the network is down, the tab is closed, the school wifi drops
 * mid-lesson, or the browser is killed, the work is still in the outbox and
 * goes up on the next page load.
 *
 * This is the quiz-town.html pattern (localStorage first, then remote, then
 * clean up) generalised -- that file already had it right.
 *
 * Usage:
 *   <script src="eduquest-backend.js"></script>
 *   <script>
 *     EduQuest.init();
 *     EduQuest.onStatus(s => renderSaveIndicator(s));
 *     await EduQuest.savePost({ classCode, studentName, wordCount, body });
 *   </script>
 * ========================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Config -- fill these in after creating the Supabase project.
  // Settings -> API -> Project URL / anon public key.
  // The anon key is meant to be public; access is controlled by the RLS
  // policies in supabase/schema.sql, not by hiding this string.
  // ---------------------------------------------------------------------
  var CONFIG = {
    url: 'YOUR_SUPABASE_URL',        // https://xxxxxxxx.supabase.co
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
    sdk: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  };

  var OUTBOX_KEY = 'eduquest_outbox_v1';
  var MAX_OUTBOX = 200;            // keep localStorage bounded
  var BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

  var client = null;
  var clientPromise = null;
  var statusHandlers = [];
  var flushTimer = null;
  var flushing = false;
  var configured = false;

  // ---------------------------------------------------------------------
  // Status reporting -- replaces the empty catch blocks.
  // state: 'saving' | 'saved' | 'queued' | 'error' | 'offline'
  // ---------------------------------------------------------------------
  function emit(state, detail) {
    var payload = { state: state, detail: detail || null, pending: outbox().length };
    statusHandlers.forEach(function (h) {
      try { h(payload); } catch (e) { console.error('[EduQuest] status handler threw', e); }
    });
    if (state === 'error') console.error('[EduQuest]', detail);
  }

  function onStatus(fn) {
    if (typeof fn === 'function') statusHandlers.push(fn);
  }

  // ---------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------
  function outbox() {
    try {
      var raw = global.localStorage.getItem(OUTBOX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeOutbox(items) {
    try {
      global.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-MAX_OUTBOX)));
      return true;
    } catch (e) {
      // Quota exceeded, or storage blocked (private mode / locked-down school
      // browser). Say so loudly -- this is the one case where we genuinely
      // cannot promise durability.
      emit('error', 'Could not write to local storage: ' + e.message);
      return false;
    }
  }

  function enqueue(op) {
    var items = outbox();
    op.id = op.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 9));
    op.attempts = 0;
    op.queued_at = new Date().toISOString();
    items.push(op);
    writeOutbox(items);
    return op.id;
  }

  function dequeue(id) {
    writeOutbox(outbox().filter(function (o) { return o.id !== id; }));
  }

  function bumpAttempts(id) {
    var items = outbox();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { items[i].attempts = (items[i].attempts || 0) + 1; break; }
    }
    writeOutbox(items);
  }

  function pendingCount() { return outbox().length; }

  // ---------------------------------------------------------------------
  // Client
  // ---------------------------------------------------------------------
  function init(opts) {
    if (opts) {
      if (opts.url) CONFIG.url = opts.url;
      if (opts.anonKey) CONFIG.anonKey = opts.anonKey;
    }
    configured = CONFIG.url.indexOf('YOUR_') !== 0 && CONFIG.anonKey.indexOf('YOUR_') !== 0;
    if (!configured) {
      emit('error', 'EduQuest backend is not configured yet -- set url and anonKey.');
      return;
    }
    global.addEventListener('online', function () { flush(); });
    // Flush anything left over from a previous session, then poll gently.
    flush();
    if (!flushTimer) flushTimer = global.setInterval(flush, 30000);
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    if (clientPromise) return clientPromise;
    if (!configured) return Promise.reject(new Error('Backend not configured'));

    clientPromise = import(CONFIG.sdk).then(function (mod) {
      client = mod.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        // School networks frequently break websockets. Realtime is opt-in
        // per page rather than on by default, so a blocked socket cannot
        // take the whole page down with it.
        realtime: { params: { eventsPerSecond: 2 } }
      });
      return client;
    });
    return clientPromise;
  }

  // ---------------------------------------------------------------------
  // The one write path. Everything public funnels through here.
  // ---------------------------------------------------------------------
  // NOTE ON `returning`:
  // PostgREST turns .select() into INSERT ... RETURNING, and under RLS
  // RETURNING requires a SELECT policy on the table. The drop-box tables
  // (posts, submissions, survey_responses, quiz_sessions) deliberately give
  // anon INSERT but no SELECT -- that is what stops one student reading the
  // class's work. So asking for the row back on those tables makes every
  // student write fail with "new row violates row-level security policy",
  // even though the policy is doing exactly what it should.
  // Default is therefore no RETURNING. Only set returning:true on tables
  // where the caller is authenticated and can read its own rows back.
  function perform(op) {
    return getClient().then(function (sb) {
      var q = sb.from(op.table);
      if (op.kind === 'insert') {
        var ins = q.insert(op.row);
        return op.returning ? ins.select('id').single() : ins;
      }
      if (op.kind === 'upsert') {
        var ups = q.upsert(op.row, { onConflict: op.onConflict });
        return op.returning ? ups.select('id').single() : ups;
      }
      if (op.kind === 'update') {
        var upd = q.update(op.row).match(op.match);
        return op.returning ? upd.select('id') : upd;
      }
      throw new Error('Unknown op kind: ' + op.kind);
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data || null;
    });
  }

  /**
   * Queue a write, then try to send it.
   * Resolves { ok, queued, id, data, error }.
   * `ok:false, queued:true` means the work is safe locally but not yet on the
   * server -- callers should show "saved on this device, will sync" rather
   * than a success tick.
   */
  function submit(op) {
    var localId = enqueue(op);
    emit('saving');

    if (!configured) {
      emit('queued', 'Backend not configured; work held locally.');
      return Promise.resolve({ ok: false, queued: true, id: localId });
    }

    return perform(op).then(function (data) {
      dequeue(localId);
      emit('saved');
      return { ok: true, queued: false, id: localId, data: data };
    }).catch(function (err) {
      bumpAttempts(localId);
      var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      emit(offline ? 'offline' : 'error', describe(err));
      scheduleRetry();
      return { ok: false, queued: true, id: localId, error: err };
    });
  }

  function describe(err) {
    if (!err) return 'Unknown error';
    if (err.message && /Failed to fetch|NetworkError|load failed/i.test(err.message)) {
      return 'Could not reach the server (network or school firewall).';
    }
    if (err.code === '42501' || /row-level security/i.test(err.message || '')) {
      return 'The server refused this write (permission rule). Tell your teacher.';
    }
    return err.message || String(err);
  }

  var retryIndex = 0;
  function scheduleRetry() {
    var delay = BACKOFF_MS[Math.min(retryIndex, BACKOFF_MS.length - 1)];
    retryIndex++;
    global.setTimeout(flush, delay);
  }

  /** Drain the outbox. Safe to call at any time; re-entrant calls no-op. */
  function flush() {
    if (flushing || !configured) return Promise.resolve();
    var items = outbox();
    if (!items.length) { retryIndex = 0; return Promise.resolve(); }

    flushing = true;
    var remaining = items.slice();

    function step() {
      if (!remaining.length) {
        flushing = false;
        retryIndex = 0;
        if (!outbox().length) emit('saved');
        return Promise.resolve();
      }
      var op = remaining.shift();
      return perform(op).then(function () {
        dequeue(op.id);
        emit('saved');
        return step();
      }).catch(function (err) {
        bumpAttempts(op.id);
        flushing = false;
        emit('error', describe(err));
        scheduleRetry();
        // Stop on first failure -- if the server is unreachable the rest will
        // fail too, and hammering it helps nobody.
        return Promise.resolve();
      });
    }
    return step();
  }

  // =====================================================================
  // Public API -- one function per thing the activities actually do
  // =====================================================================

  /**
   * Hermes Post Box. This is the call that used to be EmailJS-only.
   * The row is committed first; email is a separate, failable notification.
   */
  function savePost(rec) {
    return submit({
      kind: 'insert',
      table: 'posts',
      row: {
        class_code:   rec.classCode || 'unknown',
        student_name: rec.studentName || 'Unknown',
        student_id:   rec.studentId || null,
        word_count:   rec.wordCount || 0,
        body:         rec.body || '',
        email_status: 'pending'
      }
    });
  }

  /** Writer's Workshop / Grammar Works submission. */
  function saveSubmission(rec) {
    return submit({
      kind: 'insert',
      table: 'submissions',
      row: {
        class_code:   rec.classCode || 'unknown',
        student_name: (rec.student || '').toUpperCase(),
        lesson:       rec.lesson,
        round:        rec.round || 0,
        flag:         rec.flag,
        tags:         rec.tags || [],
        sentences:    rec.sentences || []
      }
    });
  }

  /** Survey response. */
  function saveSurvey(payload, surveyKey) {
    return submit({
      kind: 'insert',
      table: 'survey_responses',
      row: { survey_key: surveyKey || 'sociology_survey_2026', payload: payload }
    });
  }

  /** Hermes autosave -- one row per student per day. */
  function saveWritingSession(rec) {
    return submit({
      kind: 'upsert',
      table: 'writing_sessions',
      onConflict: 'student_id,session_date',
      // Authenticated student with an own-rows SELECT policy, and the caller
      // needs the session id to attach snapshots and sources to it.
      returning: true,
      row: {
        student_id:   rec.studentId,
        session_date: rec.sessionDate,
        body:         rec.body || '',
        word_count:   rec.wordCount || 0,
        last_active:  new Date().toISOString()
      }
    });
  }

  function saveDocument(rec) {
    return submit({
      kind: 'upsert',
      table: 'documents',
      onConflict: 'student_id,doc_key',
      row: {
        student_id: rec.studentId,
        doc_key:    rec.docKey,
        title:      rec.title || '',
        body:       rec.body || '',
        updated_at: new Date().toISOString()
      }
    });
  }

  function addSource(rec) {
    return submit({
      kind: 'insert',
      table: 'sources',
      row: { session_id: rec.sessionId, url: rec.url, noted_at: rec.notedAt || null }
    });
  }

  /** Quiz Town session. */
  function saveQuizSession(id, data, meta) {
    meta = meta || {};
    return submit({
      kind: 'upsert',
      table: 'quiz_sessions',
      onConflict: 'id',
      row: {
        id: id,
        student_name: meta.studentName || null,
        class_id: meta.classId || null,
        data: data
      }
    });
  }

  // ---------------------------------------------------------------------
  // Reads (teacher dashboard). These are NOT queued -- a failed read is a
  // failed read, and the caller should see the error.
  // ---------------------------------------------------------------------
  function listPosts(classCode, limit) {
    return getClient().then(function (sb) {
      var q = sb.from('posts').select('*').order('created_at', { ascending: false }).limit(limit || 200);
      if (classCode) q = q.eq('class_code', classCode);
      return q;
    }).then(unwrap);
  }

  function listSubmissions(classCode, limit) {
    return getClient().then(function (sb) {
      var q = sb.from('submissions').select('*').order('created_at', { ascending: false }).limit(limit || 500);
      if (classCode) q = q.eq('class_code', classCode);
      return q;
    }).then(unwrap);
  }

  function listSurveyResponses(surveyKey) {
    return getClient().then(function (sb) {
      return sb.from('survey_responses')
        .select('*')
        .eq('survey_key', surveyKey || 'sociology_survey_2026')
        .order('created_at', { ascending: true });
    }).then(unwrap);
  }

  function unwrap(res) {
    if (res.error) throw new Error(describe(res.error));
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Auth -- mirrors the synthesized-email scheme Hermes already uses, so
  // existing student logins keep working the same way.
  // ---------------------------------------------------------------------
  function emailFor(classCode, charName) {
    return String(classCode).toLowerCase().replace(/[^a-z0-9]/g, '') + '.' +
           String(charName).toLowerCase().replace(/[^a-z0-9]/g, '') +
           '@eduquest.invalid';
  }

  function signUpStudent(classCode, charName, code) {
    return getClient().then(function (sb) {
      return sb.auth.signUp({ email: emailFor(classCode, charName), password: code });
    }).then(function (res) {
      if (res.error) throw new Error(describe(res.error));
      return res.data;
    });
  }

  function signInStudent(classCode, charName, code) {
    return getClient().then(function (sb) {
      return sb.auth.signInWithPassword({ email: emailFor(classCode, charName), password: code });
    }).then(function (res) {
      if (res.error) throw new Error(describe(res.error));
      return res.data;
    });
  }

  function signOut() {
    return getClient().then(function (sb) { return sb.auth.signOut(); });
  }

  /**
   * Atomic avatar reservation. The Firestore version read, checked, then
   * wrote -- two students clicking at once could both win. This is one
   * statement on the server; exactly one caller gets true.
   */
  function reserveAvatar(classCode, charName) {
    return getClient().then(function (sb) {
      return sb.rpc('reserve_avatar', { p_class: classCode, p_char: charName });
    }).then(function (res) {
      if (res.error) throw new Error(describe(res.error));
      return res.data === true;
    });
  }

  // ---------------------------------------------------------------------
  global.EduQuest = {
    init: init,
    onStatus: onStatus,
    flush: flush,
    pendingCount: pendingCount,

    savePost: savePost,
    saveSubmission: saveSubmission,
    saveSurvey: saveSurvey,
    saveWritingSession: saveWritingSession,
    saveDocument: saveDocument,
    addSource: addSource,
    saveQuizSession: saveQuizSession,

    listPosts: listPosts,
    listSubmissions: listSubmissions,
    listSurveyResponses: listSurveyResponses,

    emailFor: emailFor,
    signUpStudent: signUpStudent,
    signInStudent: signInStudent,
    signOut: signOut,
    reserveAvatar: reserveAvatar,

    _client: getClient,
    _config: CONFIG
  };

})(window);
