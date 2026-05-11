/**
 * dashboard.js – Teacher-Dashboard für MMBbS GPT (Issue #5)
 *
 * Lädt die Schülerliste via WebSocket, zeigt Chat-Verläufe und
 * empfängt Live-Updates wenn Schüler neue Nachrichten senden.
 * Issue #12: Kostenanzeige (pro Nachrichtenrunde, pro Chat, Aktivitäts-Gesamt)
 */

// ── URL-Parameter ────────────────────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search);
const activityId = params.get('activityId') || '';
const token      = params.get('token')      || '';

// ── Issue #25: Modell-Einstellungen (localStorage) ───────────────────────────
const GEN_MODEL_KEYS    = ['criteria', 'personas', 'utterances', 'eval'];
const GEN_MODEL_DEFAULT = 'gpt-4.1-nano';

function getGenModel(key) {
  return localStorage.getItem(`genModel_${key}`) || GEN_MODEL_DEFAULT;
}
function setGenModel(key, value) {
  localStorage.setItem(`genModel_${key}`, value);
}

function populateGenModelSelects(models) {
  for (const key of GEN_MODEL_KEYS) {
    const sel = document.getElementById(`model-${key}`);
    if (!sel) continue;
    const saved = getGenModel(key);
    sel.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === saved) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => setGenModel(key, sel.value));
  }
}

// ── State ────────────────────────────────────────────────────────────────────
let students                = [];          // aktuelle Schülerliste (sortiert)
let selectedThreadId        = null;        // aktuell angezeigter Thread
let ws                      = null;
let sortKey                 = 'activity';  // 'activity' | 'name' | 'cost'
let sortDir                 = 'desc';      // 'asc' | 'desc'
const liveSince             = new Map();   // threadDbId → timestamp letzter Live-Nachricht
let activityOpener          = '';          // Opener-Text der Aufgabe
let hasConnectedSuccessfully = false;      // war schon mal gültig verbunden?
let fatalError              = false;       // kein Reconnect mehr
let activityCost            = null;        // Issue #12: Aktivitäts-Gesamtkosten
let currentThreadCost       = null;        // Issue #12: Kosten des aktuell geöffneten Chats
let isLocked                = false;       // P3: Plenum-Sperre

// ── DOM-Referenzen ───────────────────────────────────────────────────────────
const statusDot      = document.getElementById('status-dot');
const liveBadge      = document.getElementById('live-badge');
const pageTitle      = document.getElementById('page-title');
const studentList    = document.getElementById('student-list');
const studentCount   = document.getElementById('student-count');
const chatPanel      = document.getElementById('chat-panel');
const listPanel      = document.getElementById('list-panel');
const chatTitle      = document.getElementById('chat-title');
const chatCost       = document.getElementById('chat-cost');
const chatMessages   = document.getElementById('chat-messages');
const backBtn        = document.getElementById('back-btn');
const sortBtns       = document.querySelectorAll('.sort-btn');
const initialError   = document.getElementById('initial-error');
const expiredOverlay = document.getElementById('expired-overlay');
const costBar        = document.getElementById('cost-bar');
const costBarInput   = document.getElementById('cost-bar-input');
const costBarOutput  = document.getElementById('cost-bar-output');
const costBarTotal   = document.getElementById('cost-bar-total');
const lockBtn        = document.getElementById('lock-btn');
const lockTimer      = document.getElementById('lock-timer');
const lockBadge      = document.getElementById('lock-badge');

// ── Initialisierung ───────────────────────────────────────────────────────────
if (!activityId || !token) {
  initialError.classList.add('visible');
} else {
  connectWebSocket();
}

// Standardrichtungen pro Schlüssel
const defaultDir = { activity: 'desc', name: 'asc', cost: 'desc' };
const dirArrow   = { asc: '↑', desc: '↓' };

function updateSortButtons() {
  sortBtns.forEach(btn => {
    const key = btn.dataset.sort;
    const isActive = key === sortKey;
    btn.classList.toggle('active', isActive);
    const labels = { activity: 'Aktivität', name: 'Name', cost: 'Verbrauch' };
    const arrow = isActive ? dirArrow[sortDir] : dirArrow[defaultDir[key]];
    btn.textContent = `${labels[key]} ${arrow}`;
  });
}

sortBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sort;
    if (key === sortKey) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = defaultDir[key];
    }
    updateSortButtons();
    renderStudentList();
  });
});

backBtn.addEventListener('click', () => {
  chatPanel.classList.remove('mobile-visible');
  listPanel.classList.remove('hidden');
  selectedThreadId  = null;
  currentThreadCost = null;
  document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
  renderChatCost(null);
});

// ── P3: Plenum-Sperre ────────────────────────────────────────────────────────

function renderLockState(locked) {
  isLocked = locked;
  lockBadge.classList.toggle('visible', locked);
  lockBtn.classList.toggle('locked', locked);
  lockBtn.textContent = locked ? '🔓 Entsperren' : '🔒 Sperren';
}

lockBtn.addEventListener('click', async () => {
  const wasLocked = isLocked;
  renderLockState(!wasLocked); // optimistisch, verhindert Doppelklick-Race
  lockBtn.disabled = true;
  try {
    if (wasLocked) {
      await fetch(`/api/activity/${encodeURIComponent(activityId)}/lock?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
    } else {
      const durationMinutes = parseInt(lockTimer.value, 10) || 0;
      await fetch(`/api/activity/${encodeURIComponent(activityId)}/lock?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes }),
      });
    }
  } catch (e) {
    console.error('[Lock] Fehler:', e);
    renderLockState(wasLocked); // bei Fehler zurückrollen
  } finally {
    lockBtn.disabled = false;
  }
});

// ── Kosten-Formatierung (Issue #12) ──────────────────────────────────────────

/**
 * Formatiert einen EUR-Betrag als Cent-Angabe.
 * Schwelle: 0,0001 € (= 0,01 Cent). Darunter: "<0,01 Ct"
 * Gibt { str, ct } zurück: str = Anzeigestring, ct = gerundeter Cent-Wert (für Summenbildung).
 */
function formatCostFull(eur) {
  if (eur == null || isNaN(eur)) return { str: '–', ct: 0 };
  const raw = (eur || 0) * 100;
  if (raw < 0.01) return { str: '<0,01 Ct', ct: 0 };
  // Auf 2 Nachkommastellen runden (dann ist Summe der angezeigten Werte konsistent)
  const ct = Math.round(raw * 100) / 100;
  const str = ct.toFixed(2).replace('.', ',') + ' Ct';
  return { str, ct };
}

/** Kurzform: nur String */
function formatCost(eur) {
  return formatCostFull(eur).str;
}

/**
 * Rendert drei Kosten-Werte so, dass total = input + output stimmt (kein Rundungswiderspruch).
 * Gibt { inputStr, outputStr, totalStr } zurück.
 */
function formatCostTriple(inputEur, outputEur) {
  const inp = formatCostFull(inputEur);
  const out = formatCostFull(outputEur);
  const totalCt  = inp.ct + out.ct;
  const totalStr = totalCt < 0.01 ? '<0,01 Ct' : totalCt.toFixed(2).replace('.', ',') + ' Ct';
  return { inputStr: inp.str, outputStr: out.str, totalStr };
}

/** Rendert die Aktivitäts-Gesamtkosten in der cost-bar. */
function renderActivityCost(cost) {
  if (!cost) {
    costBar.classList.remove('visible');
    return;
  }
  const { inputStr, outputStr, totalStr } = formatCostTriple(cost.inputEur, cost.outputEur);
  costBarInput.textContent  = `↑ ${inputStr}`;
  costBarOutput.textContent = `↓ ${outputStr}`;
  costBarTotal.textContent  = `= ${totalStr}`;
  costBar.classList.add('visible');
}

/** Rendert die Thread-Kosten im Chat-Header. */
function renderChatCost(cost) {
  if (!cost) {
    chatCost.textContent = '';
    chatCost.classList.remove('visible');
    return;
  }
  const { inputStr, outputStr, totalStr } = formatCostTriple(cost.inputEur, cost.outputEur);
  chatCost.textContent = `↑${inputStr} ↓${outputStr} = ${totalStr}`;
  chatCost.classList.add('visible');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url   = `${proto}://${location.host}/api/dashboard-ws?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    hasConnectedSuccessfully = true;
    statusDot.classList.add('connected');
    liveBadge.classList.add('visible');
    console.log('[Dashboard] WS verbunden');
  };

  ws.onclose = () => {
    statusDot.classList.remove('connected');
    liveBadge.classList.remove('visible');
    if (fatalError) return;
    console.log('[Dashboard] WS getrennt, Reconnect in 5 s…');
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = (e) => console.error('[Dashboard] WS Fehler', e);

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('[Dashboard] JSON-Parse-Fehler', e);
    }
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'students':
      students = msg.data;
      if (msg.activityName) {
        pageTitle.textContent = `Schüler-Dashboard – ${msg.activityName}`;
      } else {
        pageTitle.textContent = `Schüler-Dashboard – Aufgabe ${activityId}`;
      }
      if (msg.opener) activityOpener = msg.opener;
      // Issue #12: Aktivitäts-Kosten
      activityCost = msg.activityCost || null;
      renderActivityCost(activityCost);
      // P3: initiale Sperr-Status
      renderLockState(msg.locked === true);
      renderStudentList();
      break;

    case 'messages':
      // Antwort auf getMessages-Anfrage (mit threadCost aus Issue #12)
      currentThreadCost = msg.threadCost || null;
      renderChatCost(currentThreadCost);
      renderChatView(msg.student, msg.data);
      break;

    case 'newMessage':
      handleNewMessage(msg);
      break;

    case 'configUpdated':
      handleConfigUpdated(msg);
      break;

    case 'locked':
      renderLockState(true);
      break;

    case 'unlocked':
      renderLockState(false);
      break;

    case 'error':
      console.warn('[Dashboard] Server-Fehler:', msg.message);
      if (msg.message === 'Unauthorized') {
        fatalError = true;
        if (!hasConnectedSuccessfully) {
          initialError.classList.add('visible');
        } else {
          expiredOverlay.classList.add('visible');
        }
      }
      break;
  }
}

// ── Neue Live-Nachricht ───────────────────────────────────────────────────────
function handleNewMessage(msg) {
  const { threadDbId, userId: uid, userName, role, content, contentType, createdAt,
          runCost, threadCost, activityCost: newActivityCost, messageId } = msg;

  // Schülerliste aktualisieren (Zähler + Zeitstempel + Kosten)
  const student = students.find(s => s.thread_db_id === threadDbId);
  if (student) {
    if (role === 'user') student.message_count++;
    student.updated_at = createdAt;
    // Issue #12: Thread-Kosten im Student-Objekt aktualisieren
    if (threadCost) student.threadCost = threadCost;
    liveSince.set(threadDbId, Date.now());
  } else {
    students.push({
      thread_db_id:    threadDbId,
      moodle_user_id:  uid,
      moodle_user_name: userName || '–',
      updated_at:      createdAt,
      message_count:   role === 'user' ? 1 : 0,
      threadCost:      threadCost || null,
    });
    liveSince.set(threadDbId, Date.now());
  }

  // Issue #12: Aktivitäts-Kosten aktualisieren
  if (newActivityCost) {
    activityCost = newActivityCost;
    renderActivityCost(activityCost);
  }

  renderStudentList();

  // Wenn dieser Chat gerade geöffnet ist
  if (selectedThreadId === threadDbId) {
    // Thread-Kosten im Header aktualisieren
    if (threadCost) {
      currentThreadCost = threadCost;
      renderChatCost(currentThreadCost);
    }
    // Nachricht anhängen (mit runCost + messageId für Feedback-Bar)
    appendMessage({ id: messageId, role, content, content_type: contentType || 'text', created_at: createdAt, runCost, threadDbId });
    scrollToBottom();
  }
}

// ── Schülerliste rendern ──────────────────────────────────────────────────────
function renderStudentList() {
  const sorted = [...students].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = (a.moodle_user_name || '').localeCompare(b.moodle_user_name || '', 'de');
    } else if (sortKey === 'cost') {
      const ca = a.threadCost ? (a.threadCost.inputEur + a.threadCost.outputEur) : -1;
      const cb = b.threadCost ? (b.threadCost.inputEur + b.threadCost.outputEur) : -1;
      cmp = ca - cb;
    } else {
      cmp = new Date(a.updated_at) - new Date(b.updated_at);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  studentCount.textContent = `${sorted.length} Schüler`;

  if (sorted.length === 0) {
    studentList.innerHTML = '<div class="empty-list">Noch keine Schüler aktiv.</div>';
    return;
  }

  studentList.innerHTML = '';
  for (const s of sorted) {
    const item = document.createElement('div');
    item.className = 'student-item' + (s.thread_db_id === selectedThreadId ? ' active' : '');
    item.dataset.threadId = s.thread_db_id;

    const isLive = liveSince.has(s.thread_db_id) &&
                   (Date.now() - liveSince.get(s.thread_db_id)) < 120_000;

    // Issue #12: Kosten pro Chat in der Sidebar
    const tc = s.threadCost;
    const costHtml = tc
      ? `<span class="student-cost" title="Eingabe / Ausgabe">↑${formatCost(tc.inputEur)} ↓${formatCost(tc.outputEur)}</span>`
      : '';

    item.innerHTML = `
      <div class="student-name">
        ${isLive ? '<span class="badge-new"></span>' : ''}
        ${escHtml(s.moodle_user_name || `Schüler (ID ${s.moodle_user_id})`)}
        <span class="msg-count">${s.message_count}</span>
      </div>
      <div class="student-meta">
        <span>🕐 ${relTime(s.updated_at)}</span>
        ${costHtml}
      </div>`;

    item.addEventListener('click', () => selectStudent(s));
    studentList.appendChild(item);
  }
}

// ── Schüler auswählen ─────────────────────────────────────────────────────────
function selectStudent(student) {
  selectedThreadId  = student.thread_db_id;
  currentThreadCost = null;

  liveSince.delete(student.thread_db_id);

  document.querySelectorAll('.student-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.threadId) === student.thread_db_id);
  });

  if (window.innerWidth < 768) {
    listPanel.classList.add('hidden');
    chatPanel.classList.add('mobile-visible');
  }

  chatTitle.textContent = student.moodle_user_name || '–';
  renderChatCost(null);  // zurücksetzen bis Daten geladen
  chatMessages.innerHTML = '<div class="loading">Lade Nachrichten…</div>';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'getMessages', threadDbId: student.thread_db_id }));
  }
}

// ── Session-Hilfsfunktionen ───────────────────────────────────────────────────

/** Parst ein SQLite-Datetime-String ("2026-05-01 10:13:45") als UTC-Date. */
function parseUTC(str) {
  if (!str) return new Date(0);
  return new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z');
}

function splitIntoSessions(messages, gapMs = 30 * 60 * 1000) {
  const sessions = [];
  let current = [];
  for (const msg of messages) {
    if (current.length > 0) {
      const prev = parseUTC(current[current.length - 1].created_at);
      const curr = parseUTC(msg.created_at);
      if (curr - prev > gapMs) { sessions.push(current); current = []; }
    }
    current.push(msg);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

function sessionHeaderText(session) {
  const first = parseUTC(session[0].created_at);
  const last  = parseUTC(session[session.length - 1].created_at);
  const diffMin = Math.round((last - first) / 60000);

  const now = new Date();
  const sameDay = first.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) ===
                  now.toLocaleDateString('de-DE',  { timeZone: 'Europe/Berlin' });

  const dayStr = sameDay
    ? 'Heute'
    : first.toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit'
      });

  const t1 = first.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const t2 = last.toLocaleTimeString('de-DE',  { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const durStr = diffMin > 0 ? `${diffMin} Min` : '< 1 Min';
  const cnt = session.filter(m => m.role === 'user').length;
  const cntStr = `${cnt} Nachricht${cnt !== 1 ? 'en' : ''}`;

  return `${dayStr}  ${t1}–${t2}  (${durStr}, ${cntStr})`;
}

function appendSessionHeader(session) {
  const div = document.createElement('div');
  div.className = 'session-header';
  div.textContent = sessionHeaderText(session);
  chatMessages.appendChild(div);
}

// ── Chat-Ansicht rendern ──────────────────────────────────────────────────────
function renderChatView(student, messages) {
  if (student.thread_db_id !== selectedThreadId) return;

  chatTitle.textContent = student.moodle_user_name || '–';
  chatMessages.innerHTML = '';

  if (activityOpener) {
    const od = document.createElement('div');
    od.className = 'opener-message';
    od.textContent = activityOpener;
    chatMessages.appendChild(od);
  }

  if (messages.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'chat-placeholder';
    ph.textContent = 'Noch keine Nachrichten.';
    chatMessages.appendChild(ph);
    scrollToBottom();
    return;
  }

  const sessions = splitIntoSessions(messages);
  for (const sess of sessions) {
    appendSessionHeader(sess);
    for (const m of sess) appendMessage({ ...m, threadDbId: student.thread_db_id });
  }
  scrollToBottom();
}

function renderMsgContent(role, content, contentType) {
  if (role === 'user') {
    if (contentType === 'image' || contentType === 'pdf') {
      if (content && content.startsWith('data:')) {
        const label = contentType === 'pdf'
          ? '<div style="font-size:11px;opacity:0.6;margin-top:2px">📄 PDF-Seite</div>' : '';
        return `<img src="${content}" style="max-width:200px;border-radius:6px;display:block;" class="dash-lb-trigger">${label}`;
      }
      return contentType === 'pdf'
        ? '📄 <em>PDF-Upload (1 Seite)</em>'
        : '📷 <em>Bild (extern gespeichert, ~30 Tage)</em>';
    }
    return simpleMarkdown(content);
  }
  return simpleMarkdown(content);
}

/**
 * Hängt eine Nachricht an #chat-messages an.
 * runCost (Issue #12): { inputEur, outputEur } – nur bei Assistenten-Nachrichten mit Kosten
 * id (Issue #19): DB-Message-ID für Feedback-Bar
 */
function appendMessage({ id, role, content, content_type, created_at, runCost,
                         fb_rating, fb_comment, fb_improved, threadDbId: msgThreadId }) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${role}`;
  bubble.innerHTML = renderMsgContent(role, content, content_type);

  const time = document.createElement('div');
  time.className = 'msg-time';
  if (role === 'assistant' && runCost) {
    time.textContent = `${formatTime(created_at)}  ↑ ${formatCost(runCost.inputEur)} ↓ ${formatCost(runCost.outputEur)}`;
    time.title = 'Uhrzeit  ·  Kosten: Eingabe / Ausgabe';
  } else {
    time.textContent = formatTime(created_at);
  }

  wrap.appendChild(bubble);
  wrap.appendChild(time);

  // Issue #19: Feedback-Bar für Assistenten-Nachrichten
  if (role === 'assistant' && id) {
    const threadId = msgThreadId ?? selectedThreadId;
    wrap.appendChild(buildFeedbackBar(id, threadId, content, fb_rating, fb_comment, fb_improved));
  }

  chatMessages.appendChild(wrap);
}

/** Erstellt eine Feedback-Bar für eine Assistent-Nachricht. */
function buildFeedbackBar(messageId, threadId, originalContent, initRating, initComment, initImproved) {
  const bar = document.createElement('div');
  bar.className = 'feedback-bar';

  const gutBtn      = document.createElement('button');
  gutBtn.className  = 'fb-btn gut' + (initRating === 'gut' ? ' active' : '');
  gutBtn.textContent = '✅ Gut';

  const schlechtBtn     = document.createElement('button');
  schlechtBtn.className = 'fb-btn schlecht' + (initRating === 'schlecht' ? ' active' : '');
  schlechtBtn.textContent = '❌ Schlecht';

  const commentInput      = document.createElement('input');
  commentInput.type       = 'text';
  commentInput.className  = 'fb-comment' + (initRating === 'schlecht' ? ' schlecht-hl' : '');
  commentInput.placeholder = 'Kommentar…';
  commentInput.value      = initComment || '';
  commentInput.title      = 'Kommentar zur Bewertung (besonders bei "Schlecht" hilfreich)';

  const editBtn      = document.createElement('button');
  editBtn.className  = 'fb-btn edit';
  editBtn.textContent = '✏';
  editBtn.title      = 'Antwort bearbeiten und als gut markieren';

  const statusSpan     = document.createElement('span');
  statusSpan.className = 'fb-status';

  // Edit-Bereich
  const editArea = document.createElement('div');
  editArea.className = 'fb-edit-area' + (initImproved ? ' visible' : '');

  const editTextarea    = document.createElement('textarea');
  editTextarea.className = 'fb-edit-textarea';
  editTextarea.value    = initImproved || originalContent || '';
  editTextarea.rows     = 4;

  const saveEditBtn      = document.createElement('button');
  saveEditBtn.className  = 'fb-save-edit';
  saveEditBtn.textContent = 'Als gut speichern';

  editArea.appendChild(editTextarea);
  editArea.appendChild(saveEditBtn);

  bar.append(gutBtn, schlechtBtn, commentInput, editBtn, statusSpan, editArea);

  // ── Event-Handler ──
  let currentRating = initRating || null;

  function applyRatingStyle(rating) {
    gutBtn.classList.toggle('active', rating === 'gut');
    schlechtBtn.classList.toggle('active', rating === 'schlecht');
    commentInput.classList.toggle('schlecht-hl', rating === 'schlecht');
  }

  async function save(rating, comment, improvedText) {
    statusSpan.textContent = '…';
    try {
      await apiFetch(`/api/feedback?activityId=${encodeURIComponent(activityId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, threadId, rating, comment, improvedText }),
      });
      statusSpan.textContent = '✓';
      setTimeout(() => { if (statusSpan.textContent === '✓') statusSpan.textContent = ''; }, 2000);
    } catch (e) {
      statusSpan.textContent = '⚠';
      console.warn('[Feedback] Fehler:', e);
    }
  }

  gutBtn.addEventListener('click', () => {
    currentRating = 'gut';
    applyRatingStyle('gut');
    save('gut', commentInput.value, editArea.classList.contains('visible') ? editTextarea.value : null);
  });

  schlechtBtn.addEventListener('click', () => {
    currentRating = 'schlecht';
    applyRatingStyle('schlecht');
    save('schlecht', commentInput.value, null);
    if (!commentInput.value) commentInput.focus();
  });

  commentInput.addEventListener('blur', () => {
    if (!currentRating) return;
    save(currentRating, commentInput.value, editArea.classList.contains('visible') ? editTextarea.value : null);
  });

  editBtn.addEventListener('click', () => {
    editArea.classList.toggle('visible');
  });

  saveEditBtn.addEventListener('click', () => {
    currentRating = 'gut';
    applyRatingStyle('gut');
    save('gut', commentInput.value, editTextarea.value);
    editArea.classList.remove('visible');
  });

  return bar;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function simpleMarkdown(text) {
  // Extract LaTeX before HTML-escaping so backslashes and < > survive intact.
  // Placeholders use null bytes (\x00) which escHtml never touches.
  const math = [];
  let s = text;

  // Block math: $$...$$ and \[...\]
  s = s.replace(/\$\$([\s\S]+?)\$\$/g,   (_, m) => { math.push({ m, d: true  }); return `\x00math${math.length-1}\x00`; });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g,   (_, m) => { math.push({ m, d: true  }); return `\x00math${math.length-1}\x00`; });
  // Inline math: \(...\) and $...$
  s = s.replace(/\\\((.+?)\\\)/g,        (_, m) => { math.push({ m, d: false }); return `\x00math${math.length-1}\x00`; });
  s = s.replace(/\$([^\n$]+?)\$/g,       (_, m) => { math.push({ m, d: false }); return `\x00math${math.length-1}\x00`; });

  let html = escHtml(s);
  html = html.replace(/```[\s\S]*?```/g, match => `<pre>${match.slice(3, -3).trim()}</pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');

  if (math.length) {
    html = html.replace(/\x00math(\d+)\x00/g, (_, i) => {
      const { m, d } = math[+i];
      try {
        return window.katex
          ? katex.renderToString(m, { displayMode: d, throwOnError: false })
          : escHtml(d ? `$$${m}$$` : `$${m}$`);
      } catch { return escHtml(d ? `$$${m}$$` : `$${m}$`); }
    });
  }

  return html;
}

function relTime(isoStr) {
  if (!isoStr) return '–';
  const diff = Date.now() - parseUTC(isoStr).getTime(); // parseUTC: SQLite-UTC korrekt parsen
  if (isNaN(diff)) return isoStr;
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'gerade eben';
  const m = Math.floor(s / 60);
  if (m < 60)  return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d > 1 ? 'en' : ''}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d    = parseUTC(isoStr);
    const now  = new Date();
    const tz   = { timeZone: 'Europe/Berlin' };
    const time = d.toLocaleTimeString('de-DE', { ...tz, hour: '2-digit', minute: '2-digit' });
    const sameDay = d.toLocaleDateString('de-DE', tz) === now.toLocaleDateString('de-DE', tz);
    if (sameDay) return time;
    return d.toLocaleDateString('de-DE', { ...tz, day: '2-digit', month: '2-digit' }) + ' ' + time;
  } catch { return isoStr; }
}

// Live-Badges alle 30 s neu rendern (relTime aktualisieren)
setInterval(renderStudentList, 30_000);

// ── Lightbox (Issue #15) ──────────────────────────────────────────────────────
function initLightbox() {
  const lb    = document.getElementById('dash-lightbox');
  const inner = document.getElementById('dash-lb-inner');
  const img   = document.getElementById('dash-lb-img');
  if (!lb || !inner || !img) return;

  // Schließen
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.getElementById('dash-lb-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // Lightbox öffnen per Delegation (onclick-Attribut geht nicht in type="module")
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.dash-lb-trigger');
    if (trigger) openLightbox(trigger.src || trigger.dataset.src);
  });

  // Maus-Zoom: cursor-zentriert, mit erzwungenem Reflow vor scrollLeft
  inner.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.05 : (1 / 1.05);
    const innerRect = inner.getBoundingClientRect();

    const cursorX = inner.scrollLeft + (e.clientX - innerRect.left);
    const cursorY = inner.scrollTop  + (e.clientY - innerRect.top);

    const curW = img.offsetWidth, curH = img.offsetHeight;
    const imgX = Math.max(0, (inner.clientWidth  - curW) / 2);
    const imgY = parseFloat(img.style.marginTop || '0');
    const rx = (cursorX - imgX) / curW;
    const ry = (cursorY - imgY) / curH;

    const natW = img.naturalWidth  || inner.clientWidth;
    const natH = img.naturalHeight || inner.clientHeight;
    const newW = Math.min(Math.max(curW * factor, 100), natW * 6);
    const newH = newW / natW * natH;

    img.style.width = newW + 'px';
    void inner.scrollWidth; // ← synchroner Reflow

    const newImgX = Math.max(0, (inner.clientWidth  - newW) / 2);
    const newImgY = Math.max(0, (inner.clientHeight - newH) / 2);
    img.style.marginTop = newImgY + 'px';
    inner.scrollLeft = newImgX + rx * newW - (e.clientX - innerRect.left);
    inner.scrollTop  = newImgY + ry * newH - (e.clientY - innerRect.top);
  }, { passive: false });

  // Drag-to-Pan (Maus)
  let isDragging = false, dragX, dragY, scrollX, scrollY;
  img.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragX = e.clientX; dragY = e.clientY;
    scrollX = inner.scrollLeft; scrollY = inner.scrollTop;
    img.classList.add('dash-dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    inner.scrollLeft = scrollX - (e.clientX - dragX);
    inner.scrollTop  = scrollY - (e.clientY - dragY);
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    img.classList.remove('dash-dragging');
  });

  // Pinch-to-Zoom (iPad)
  let initDist = null, initW = 0;
  inner.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initW = img.offsetWidth;
    }
  }, { passive: true });
  inner.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initDist) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const natW = img.naturalWidth || inner.clientWidth;
      img.style.width = Math.min(Math.max(initW * dist / initDist, 100), natW * 6) + 'px';
    }
  }, { passive: false });
  inner.addEventListener('touchend', () => { initDist = null; });
}

function openLightbox(src) {
  const lb    = document.getElementById('dash-lightbox');
  const inner = document.getElementById('dash-lb-inner');
  const img   = document.getElementById('dash-lb-img');
  if (!lb || !inner || !img) return;
  img.style.width = '';
  img.src = src;
  inner.scrollLeft = 0;
  inner.scrollTop  = 0;
  lb.style.display = 'flex';

  const fitImg = () => {
    const natW = img.naturalWidth, natH = img.naturalHeight;
    if (!natW || !natH) return;
    const scale = Math.min(1, inner.clientWidth / natW, inner.clientHeight / natH);
    if (scale < 1) img.style.width = Math.round(natW * scale) + 'px';
    // Vertikale Zentrierung per marginTop (CSS-Flex entfernt → explizit setzen)
    const dispH = img.offsetHeight || Math.round(natH * scale);
    img.style.marginTop = Math.max(0, (inner.clientHeight - dispH) / 2) + 'px';
  };
  if (img.complete && img.naturalWidth) { fitImg(); } else { img.onload = fitImg; }
}

function closeLightbox() {
  const lb = document.getElementById('dash-lightbox');
  if (lb) lb.style.display = 'none';
}

initLightbox();

// ── Tab-Navigation (Issue #17) ────────────────────────────────────────────────
const tabBtns        = document.querySelectorAll('.tab-btn');
const toolbarEl      = document.getElementById('toolbar');
const mainEl         = document.getElementById('main');
const settingsPanel  = document.getElementById('settings-panel');
const optimizePanel  = document.getElementById('optimize-panel');
const adminBadge     = document.getElementById('admin-badge');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    const isStudents = tab === 'students';
    toolbarEl.style.display = isStudents ? '' : 'none';
    costBar.style.display   = isStudents ? '' : 'none';
    mainEl.style.display    = isStudents ? '' : 'none';
    settingsPanel.classList.toggle('visible', tab === 'settings');
    optimizePanel.classList.toggle('visible', tab === 'optimize');
    if (tab === 'settings')  loadSettings();
    if (tab === 'optimize')  { loadOptimizePanel(); loadSimulatePanel(); }
  });
});

// configUpdated vom Server (anderer Admin hat etwas geändert)
function handleConfigUpdated(msg) {
  if (!settingsData) return;
  settingsData.model = msg.model;
  const disp = document.getElementById('global-model-display');
  if (disp) disp.textContent = msg.model || '–';
  const sel = document.getElementById('global-model-select');
  if (sel) sel.value = msg.model;
  const myFirst = document.getElementById('my-model-select')?.options[0];
  if (myFirst) myFirst.text = `Standard (${msg.model})`;
}

// ── Settings: Hilfsfunktionen ─────────────────────────────────────────────────

let settingsLoaded = false;
let settingsData   = null;

function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.className   = 'status-msg' + (isError ? ' error' : '');
  if (msg && !isError) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

async function apiFetch(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r   = await fetch(`${path}${sep}token=${encodeURIComponent(token)}`, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
  return r.json();
}
const apiGet    = path          => apiFetch(path);
const apiPut    = (path, body)  => apiFetch(path, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const apiPost   = (path, body)  => apiFetch(path, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const apiDelete = path          => apiFetch(path, { method: 'DELETE' });

// ── Settings laden ────────────────────────────────────────────────────────────

async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  try {
    settingsData = await apiGet('/api/admin/config');
    applySettingsData(settingsData);
    if (settingsData.isAdmin) {
      loadAdmins();
      loadPromptHistory();
      apiGet('/api/admin/system-template').then(st => {
        document.getElementById('st-title').value       = st.title         || '';
        document.getElementById('st-bot-icon').value    = st.botIcon       || 'grw';
        document.getElementById('st-opener').value      = st.opener        || '';
        document.getElementById('st-upload-mode').value = st.uploadMode    || 'off';
        document.getElementById('st-hints').value       = st.hintsTemplate || '';
      }).catch(() => {});
    }
  } catch (e) {
    settingsLoaded = false;
    console.error('[Settings] Ladefehler:', e);
    const status = document.getElementById('sp-save-status');
    if (status) setStatus(status, 'Einstellungen konnten nicht geladen werden – Token fehlt oder ungültig.', true);
  }
}

function applySettingsData(data) {
  document.getElementById('sp-display').value            = data.systemPrompt || '';
  document.getElementById('global-model-display').textContent = data.model || '–';

  // Issue #25: Gen-Modell-Selects befüllen + Chat-Modell-Feld setzen
  if (data.genModels?.length) populateGenModelSelects(data.genModels);
  const chatModelInput = document.getElementById('model-chat');
  if (chatModelInput) chatModelInput.value = data.model || '–';

  // Persönliches Modell-Dropdown
  const mySelect = document.getElementById('my-model-select');
  mySelect.innerHTML = `<option value="">Standard (${escHtml(data.model)})</option>`;
  for (const m of data.availableModels) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === data.myModel) opt.selected = true;
    mySelect.appendChild(opt);
  }

  if (!data.isAdmin) return;

  // Admin-Bereiche einblenden
  adminBadge.classList.add('visible');
  document.getElementById('sp-admin-section').style.display     = 'flex';
  document.getElementById('sp-history-details').style.display   = '';
  document.getElementById('admin-personas-card').style.display  = '';
  document.getElementById('admin-mgmt-card').style.display      = '';
  document.getElementById('system-template-card').style.display = '';
  loadAdminPersonas();

  // Admin-Formular
  document.getElementById('sp-edit').value = data.systemPrompt || '';
  const glbSel = document.getElementById('global-model-select');
  glbSel.innerHTML = '';
  for (const m of data.availableModels) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === data.model) opt.selected = true;
    glbSel.appendChild(opt);
  }
}

// ── Persönliches Modell speichern ─────────────────────────────────────────────

document.getElementById('save-my-model-btn').addEventListener('click', async () => {
  const model  = document.getElementById('my-model-select').value;
  const status = document.getElementById('my-model-status');
  try {
    await apiPut('/api/teacher/preferences', { model: model || null });
    setStatus(status, model ? `Modell gesetzt: ${model}` : 'Auf Standard zurückgesetzt');
  } catch (e) { setStatus(status, e.message, true); }
});

// ── Globalmodell-Wechsel erfordert Bestätigung ────────────────────────────────

document.getElementById('global-model-select').addEventListener('change', e => {
  const confirmRow = document.getElementById('model-confirm-row');
  if (e.target.value !== settingsData?.model) {
    confirmRow.classList.add('visible');
    document.getElementById('model-confirm-input').value = '';
  } else {
    confirmRow.classList.remove('visible');
  }
});

// ── Systemprompt + Modell speichern (Admin) ───────────────────────────────────

document.getElementById('sp-save-btn').addEventListener('click', async () => {
  const status       = document.getElementById('sp-save-status');
  const content      = document.getElementById('sp-edit').value;
  const model        = document.getElementById('global-model-select').value;
  const confirmRow   = document.getElementById('model-confirm-row');
  const confirmInput = document.getElementById('model-confirm-input');

  if (confirmRow.classList.contains('visible') && confirmInput.value.trim() !== model) {
    setStatus(status, 'Bitte den Modellnamen korrekt zur Bestätigung eingeben.', true);
    return;
  }
  try {
    await apiPut('/api/admin/config', { systemPrompt: content, model });
    setStatus(status, 'Gespeichert.');
    document.getElementById('sp-display').value = content;
    document.getElementById('global-model-display').textContent = model;
    confirmRow.classList.remove('visible');
    settingsData.systemPrompt = content;
    settingsData.model        = model;
    loadPromptHistory();
  } catch (e) { setStatus(status, e.message, true); }
});

// ── Versionshistorie ──────────────────────────────────────────────────────────

async function loadPromptHistory() {
  try {
    const data   = await apiGet('/api/admin/prompt-history');
    const list   = document.getElementById('sp-history-list');
    const status = document.getElementById('sp-save-status');
    list.innerHTML = '';
    const latestId = data.history[0]?.id;
    for (const h of data.history) {
      const d = document.createElement('div');
      d.className = 'history-item';
      const deleteBtn = h.id !== latestId
        ? `<button class="history-delete-btn" data-id="${h.id}">Löschen</button>`
        : '';
      d.innerHTML = `
        <div class="history-meta">
          v${h.version} · ${escHtml(h.model || '–')} · ${formatTime(h.created_at)} · ${escHtml(h.created_by || '–')}
          <button class="history-expand-btn">Anzeigen</button>${deleteBtn}
        </div>
        <div class="history-content">${escHtml(h.content || '')}</div>`;
      list.appendChild(d);
    }
    list.querySelectorAll('.history-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const content = btn.closest('.history-item').querySelector('.history-content');
        content.classList.toggle('expanded');
        btn.textContent = content.classList.contains('expanded') ? 'Ausblenden' : 'Anzeigen';
      });
    });
    list.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await apiDelete(`/api/admin/prompt-history/${btn.dataset.id}`);
          await loadPromptHistory();
          setStatus(status, 'Eintrag gelöscht.');
        } catch (e) { setStatus(status, e.message, true); }
      });
    });
  } catch (e) { console.warn('[Settings] Historyfehler:', e); }
}

// ── Admin-Verwaltung ──────────────────────────────────────────────────────────

async function loadAdmins() {
  try {
    const data = await apiGet('/api/admin/admins');
    renderAdminList(data.admins);
  } catch (e) { console.warn('[Settings] Admin-Liste Fehler:', e); }
}

function renderAdminList(admins) {
  const list = document.getElementById('admin-list');
  list.innerHTML = '';
  for (const a of admins) {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <span class="admin-id">${escHtml(a.moodle_user_id)}</span>
      <span class="admin-since">seit ${formatTime(a.granted_at)}</span>
      <button class="settings-btn danger" data-uid="${escHtml(a.moodle_user_id)}" style="padding:3px 8px;font-size:12px">Entfernen</button>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-uid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid    = btn.dataset.uid;
      const status = document.getElementById('admin-status');
      try {
        const data = await apiDelete(`/api/admin/admins/${encodeURIComponent(uid)}`);
        renderAdminList(data.admins);
        setStatus(status, `${uid} entfernt.`);
      } catch (e) { setStatus(status, e.message, true); }
    });
  });
}

// ── Simulations-Panel (Issue #21) ────────────────────────────────────────────

let simulateLoaded = false;

async function loadSimulatePanel() {
  if (simulateLoaded) return;
  simulateLoaded = true;
  await Promise.all([loadCriteria(), loadPersonas()]);
  // genModels befüllen – entweder aus Cache oder frisch holen
  const cfg = settingsData || await apiGet('/api/admin/config').catch(() => null);
  if (cfg) {
    if (!settingsData) settingsData = cfg;
    if (cfg.genModels?.length) populateGenModelSelects(cfg.genModels);
    const chatInput = document.getElementById('model-chat');
    if (chatInput) chatInput.value = cfg.model || '–';
  }
}

// ── Kriterien ─────────────────────────────────────────────────────────────────

async function loadCriteria() {
  try {
    const data = await apiFetch(`/api/criteria/${encodeURIComponent(activityId)}`);
    renderCriteria(data.criteria || []);
    renderDeletedCriteria(data.deletedCriteria || []);
  } catch (e) { console.warn('[Simulate] Kriterien Ladefehler:', e); }
}

function renderCriteria(criteria) {
  const list = document.getElementById('criteria-list');
  list.innerHTML = criteria.length ? '' : '<p style="font-size:13px;color:#aaa;margin:4px 0">Noch keine Kriterien – KI vorschlagen lassen oder manuell hinzufügen.</p>';
  for (const c of criteria) {
    const item = document.createElement('div');
    item.className = 'criteria-item';
    item.innerHTML = `<span class="ci-text">${escHtml(c.content)}</span>
      <button class="fb-btn" data-cid="${c.id}" style="padding:2px 6px;font-size:12px;border-color:#e74c3c;color:#e74c3c">✕</button>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-cid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await apiFetch(`/api/criteria/${btn.dataset.cid}?activityId=${encodeURIComponent(activityId)}`, { method: 'DELETE' });
        renderCriteria(data.criteria || []);
        renderDeletedCriteria(data.deletedCriteria || []);
      } catch (e) { console.warn('[Simulate] Kriterium löschen:', e); }
    });
  });
}

function renderDeletedCriteria(criteria) {
  const container = document.getElementById('criteria-deleted');
  if (!criteria.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = '<p style="font-size:12px;color:#888;margin:8px 0 4px">Verworfene Vorschläge:</p>';
  for (const c of criteria) {
    const item = document.createElement('div');
    item.className = 'criteria-item';
    item.style.opacity = '0.6';
    item.innerHTML = `<span class="ci-text" style="text-decoration:line-through">${escHtml(c.content)}</span>
      <button class="fb-btn" data-rid="${c.id}" style="padding:2px 6px;font-size:12px">Wiederherstellen</button>`;
    container.appendChild(item);
  }
  container.querySelectorAll('[data-rid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await apiFetch(`/api/criteria/${btn.dataset.rid}/restore?activityId=${encodeURIComponent(activityId)}`, { method: 'PATCH' });
        renderCriteria(data.criteria || []);
        renderDeletedCriteria(data.deletedCriteria || []);
      } catch (e) { console.warn('[Simulate] Kriterium wiederherstellen:', e); }
    });
  });
}

document.getElementById('criteria-suggest-btn').addEventListener('click', async () => {
  const btn     = document.getElementById('criteria-suggest-btn');
  const loading = document.getElementById('criteria-loading');
  const sugg    = document.getElementById('criteria-suggestions');
  btn.disabled = true;
  loading.classList.add('visible');
  sugg.style.display = 'none';
  try {
    const data = await apiFetch(`/api/criteria-suggest/${encodeURIComponent(activityId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: getGenModel('criteria') }),
    });
    renderCriteriaSuggestions(data.suggestions || []);
  } catch (e) {
    setStatus(document.getElementById('criteria-status'), `Fehler: ${e.message}`, true);
  } finally {
    loading.classList.remove('visible');
    btn.disabled = false;
  }
});

function renderCriteriaSuggestions(suggestions) {
  const sugg = document.getElementById('criteria-suggestions');
  sugg.innerHTML = '<div style="font-size:12px;color:#888;margin-bottom:6px">KI-Vorschläge – klicken zum Übernehmen:</div>';
  sugg.style.display = 'block';
  for (const s of suggestions) {
    const btn = document.createElement('button');
    btn.className = 'suggest-btn';
    btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:4px';
    btn.textContent = s;
    btn.addEventListener('click', async () => {
      try {
        const data = await apiFetch(`/api/criteria/${encodeURIComponent(activityId)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: s }),
        });
        renderCriteria(data.criteria || []);
        renderDeletedCriteria(data.deletedCriteria || []);
        btn.remove();
        if (!sugg.querySelector('button')) sugg.style.display = 'none';
      } catch (e) { console.warn(e); }
    });
    sugg.appendChild(btn);
  }
}

document.getElementById('criteria-add-btn').addEventListener('click', async () => {
  const input  = document.getElementById('criteria-input');
  const status = document.getElementById('criteria-status');
  const content = input.value.trim();
  if (!content) return;
  try {
    const data = await apiFetch(`/api/criteria/${encodeURIComponent(activityId)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
    });
    renderCriteria(data.criteria || []);
    renderDeletedCriteria(data.deletedCriteria || []);
    input.value = '';
    setStatus(status, 'Kriterium hinzugefügt.');
  } catch (e) { setStatus(status, e.message, true); }
});

document.getElementById('criteria-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('criteria-add-btn').click();
});

// ── Personas (P6) ─────────────────────────────────────────────────────────────

let cachedGlobalPersonas = [];

async function loadPersonas() {
  try {
    const data = await apiFetch('/api/personas');
    cachedGlobalPersonas = data.global || [];
    renderGlobalPersonas(cachedGlobalPersonas);
    renderOwnPersonas(data.own || []);
    populatePersonaSelect(cachedGlobalPersonas, data.own || []);
  } catch (e) { console.warn('[Simulate] Personas Ladefehler:', e); }
}

function renderGlobalPersonas(personas) {
  const container = document.getElementById('personas-global');
  container.innerHTML = personas.length
    ? ''
    : '<span style="font-size:12px;color:#aaa">Noch keine globalen Typen.</span>';
  for (const p of personas) {
    const pill = document.createElement('span');
    pill.title = p.description || '';
    pill.style.cssText = 'display:inline-block;padding:3px 10px;border-radius:20px;background:#e8edf4;color:#003366;font-size:12px;cursor:default';
    pill.textContent = p.name;
    container.appendChild(pill);
  }
}

function renderOwnPersonas(personas) {
  const list = document.getElementById('personas-own');
  list.innerHTML = personas.length
    ? ''
    : '<p style="font-size:13px;color:#aaa;margin:4px 0">Noch keine eigenen Personas – KI vorschlagen lassen.</p>';

  for (const p of personas) {
    const item = document.createElement('div');
    item.className = 'persona-item';
    item.innerHTML = `
      <div class="pi-name">${escHtml(p.name)}</div>
      <div class="pi-desc">${escHtml(p.description || '')}</div>
      ${p.example_msgs ? `<div class="pi-examples">${escHtml(p.example_msgs)}</div>` : ''}
      <div class="pi-actions">
        <button class="fb-btn" data-pid="${p.id}" style="padding:2px 6px;font-size:12px;border-color:#e74c3c;color:#e74c3c">Löschen</button>
      </div>`;
    list.appendChild(item);
  }

  list.querySelectorAll('[data-pid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await apiFetch(`/api/personas/${btn.dataset.pid}`, { method: 'DELETE' });
        renderOwnPersonas(data.own || []);
        populatePersonaSelect(cachedGlobalPersonas, data.own || []);
      } catch (e) { console.warn('[Simulate] Persona löschen:', e); }
    });
  });
}

function populatePersonaSelect(globalPersonas, ownPersonas) {
  const select = document.getElementById('sim-persona-select');
  select.innerHTML = '<option value="">– Persona auswählen –</option>';
  if (ownPersonas.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Meine Personas';
    for (const p of ownPersonas) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      grp.appendChild(opt);
    }
    select.appendChild(grp);
  }
  if (globalPersonas.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Globale Typen';
    for (const p of globalPersonas) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      grp.appendChild(opt);
    }
    select.appendChild(grp);
  }
}

document.getElementById('personas-suggest-btn').addEventListener('click', async () => {
  const btn     = document.getElementById('personas-suggest-btn');
  const loading = document.getElementById('personas-loading');
  const sugg    = document.getElementById('personas-suggestions');
  btn.disabled = true;
  loading.classList.add('visible');
  sugg.style.display = 'none';
  try {
    const data = await apiFetch(`/api/personas-suggest?activityId=${encodeURIComponent(activityId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genModel: getGenModel('personas') }),
    });
    renderPersonaSuggestions(data.suggestions || []);
  } catch (e) {
    setStatus(document.getElementById('personas-status'), `Fehler: ${e.message}`, true);
  } finally {
    loading.classList.remove('visible');
    btn.disabled = false;
  }
});

function renderPersonaSuggestions(suggestions) {
  const sugg = document.getElementById('personas-suggestions');
  sugg.innerHTML = '<div style="font-size:12px;color:#888;margin-bottom:6px">KI-Vorschläge – klicken zum Speichern als eigene Persona:</div>';
  sugg.style.display = 'block';
  for (const s of suggestions) {
    const btn = document.createElement('button');
    btn.className = 'suggest-btn';
    btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:6px';
    btn.innerHTML = `<strong>${escHtml(s.name)}</strong><br><span style="font-size:12px">${escHtml(s.description || '')}</span>`;
    btn.addEventListener('click', async () => {
      try {
        const data = await apiPost('/api/personas', { name: s.name, description: s.description, example_msgs: s.example_msgs });
        renderOwnPersonas(data.own || []);
        populatePersonaSelect(cachedGlobalPersonas, data.own || []);
        btn.remove();
        if (!sugg.querySelector('button')) sugg.style.display = 'none';
      } catch (e) { console.warn(e); }
    });
    sugg.appendChild(btn);
  }
}

// ── Admin: Lehrer-Personas (P6) ───────────────────────────────────────────────

let cachedAdminPersonas = [];

async function loadAdminPersonas() {
  try {
    const data = await apiGet('/api/admin/personas');
    cachedAdminPersonas = data.personas || [];
    renderAdminPersonas(cachedAdminPersonas);
  } catch (e) { console.warn('[Admin] Personas Ladefehler:', e); }
}

function renderAdminPersonas(personas) {
  const list   = document.getElementById('admin-personas-list');
  const filter = document.getElementById('admin-personas-filter');

  const selectedName = filter.value;
  const names = [...new Set(personas.map(p => p.teacher_name || p.teacher_id).filter(Boolean))].sort();
  filter.innerHTML = '<option value="">– Alle Lehrkräfte –</option>';
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    if (n === selectedName) opt.selected = true;
    filter.appendChild(opt);
  }

  const filtered = selectedName ? personas.filter(p => (p.teacher_name || p.teacher_id) === selectedName) : personas;
  list.innerHTML = filtered.length ? '' : '<p style="font-size:13px;color:#aaa;margin:4px 0">Keine Lehrer-Personas vorhanden.</p>';

  for (const p of filtered) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #eef0f3;font-size:13px';
    row.innerHTML = `
      <span style="flex:2;font-weight:600;color:#003366">${escHtml(p.name)}</span>
      <span style="flex:3;color:#555;font-size:12px">${escHtml(p.description || '')}</span>
      <span style="flex:1;color:#888;font-size:11px">${escHtml(p.teacher_name || p.teacher_id || '–')}</span>
      <button class="fb-btn" data-apid="${p.id}" data-action="promote" style="font-size:11px;padding:2px 6px;border-color:#2980b9;color:#2980b9">Global</button>
      <button class="fb-btn" data-apid="${p.id}" data-action="delete" style="font-size:11px;padding:2px 6px;border-color:#e74c3c;color:#e74c3c">Löschen</button>`;
    list.appendChild(row);
  }

  list.querySelectorAll('[data-apid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = btn.dataset.apid;
      const action = btn.dataset.action;
      try {
        if (action === 'promote') {
          await apiFetch(`/api/admin/personas/${id}/promote`, { method: 'PUT' });
        } else {
          await apiFetch(`/api/admin/personas/${id}`, { method: 'DELETE' });
        }
        await loadAdminPersonas();
        await loadPersonas();
      } catch (e) { console.warn('[Admin] Persona-Aktion Fehler:', e); }
    });
  });
}

document.getElementById('admin-personas-filter').addEventListener('change', () => {
  renderAdminPersonas(cachedAdminPersonas);
});

document.getElementById('admin-persona-add-btn').addEventListener('click', async () => {
  const name = document.getElementById('admin-persona-name').value.trim();
  const desc = document.getElementById('admin-persona-desc').value.trim();
  if (!name) return;
  try {
    await apiPost('/api/admin/personas', { name, description: desc });
    document.getElementById('admin-persona-name').value = '';
    document.getElementById('admin-persona-desc').value = '';
    setStatus(document.getElementById('admin-personas-status'), '✓ Globale Persona gespeichert');
    await loadPersonas();
  } catch (e) {
    setStatus(document.getElementById('admin-personas-status'), `Fehler: ${e.message}`, true);
  }
});

// ── Simulation starten ────────────────────────────────────────────────────────

// ── Issue #26: SSE-Simulation ─────────────────────────────────────────────────

// Issues #29 #30 #31: gemeinsame Simulation-Logik für beide Buttons
async function runSimulation() {
  const personaId = document.getElementById('sim-persona-select').value;
  if (!personaId) { alert('Bitte eine Persona auswählen.'); return; }

  const loading  = document.getElementById('sim-loading');
  const bar      = document.getElementById('sim-progress-bar');
  const progLbl  = document.getElementById('sim-progress');
  const results  = document.getElementById('sim-results');
  const suggDiv  = document.getElementById('sim-suggestion');
  const startBtn = document.getElementById('sim-start-btn');

  function setProgress(pct, label) {
    bar.style.width = pct + '%';
    progLbl.textContent = label;
  }

  loading.classList.add('visible');
  startBtn.disabled = true;
  results.innerHTML = '';
  suggDiv.innerHTML = '';
  setProgress(0, 'Starte…');

  let headerAdded  = false;
  let progressStep = 0;
  let pairsTotal   = 4;
  const pairTimes  = [];

  function etaSuffix(pairsLeft) {
    if (pairTimes.length < 2) return '';
    const avg  = (pairTimes[pairTimes.length - 1] - pairTimes[0]) / (pairTimes.length - 1);
    const secs = Math.round(pairsLeft * avg / 1000);
    return secs > 2 ? ` (~${secs} Sek.)` : '';
  }

  try {
    const response = await fetch(
      `/api/simulate?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId:      parseInt(personaId),
          utteranceModel: getGenModel('utterances'),
          evalModel:      getGenModel('eval'),
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }

        if (ev.type === 'start') {
          pairsTotal = ev.total || 4;
          setProgress(5, `Simulation gestartet (${pairsTotal} Paare)…`);
        } else if (ev.type === 'progress') {
          progressStep++;
          if (progressStep === 1) {
            setProgress(10, ev.label || 'Generiere Äußerungen…');
          } else {
            setProgress(90, ev.label || 'Generiere Vorschlag…');
          }
        } else if (ev.type === 'pair') {
          pairTimes.push(Date.now());
          if (!headerAdded) {
            results.innerHTML = `<p style="font-size:13px;font-weight:600;color:#003366;margin-bottom:8px">Simulation: ${escHtml(ev.personaName || '')}</p>`;
            headerAdded = true;
          }
          renderSimPair(ev.pair, ev.index, results);
          const pct = Math.min(20 + (ev.index + 1) * 17, 88);
          const eta = etaSuffix(pairsTotal - (ev.index + 1));
          setProgress(pct, `Äußerung ${ev.index + 1}/${pairsTotal} ausgewertet${eta}`);
        } else if (ev.type === 'suggestion') {
          renderSimSuggestion(ev, suggDiv);
        } else if (ev.type === 'done') {
          setProgress(100, 'Simulation abgeschlossen.');

          const ctaBtn = document.createElement('button');
          ctaBtn.className = 'sim-cta-btn';
          ctaBtn.textContent = 'Zum Optimierungsvorschlag →';
          ctaBtn.addEventListener('click', () => {
            document.getElementById('opt-proposal-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          results.appendChild(ctaBtn);
        } else if (ev.type === 'error') {
          results.insertAdjacentHTML('beforeend', `<p style="color:#c0392b;font-size:13px">Fehler: ${escHtml(ev.message)}</p>`);
        }
      }
    }
  } catch (e) {
    results.innerHTML = `<p style="color:#c0392b;font-size:13px">Fehler: ${escHtml(e.message)}</p>`;
  } finally {
    loading.classList.remove('visible');
    startBtn.disabled = false;
  }
}

document.getElementById('sim-start-btn').addEventListener('click', () => runSimulation());

function highlightResponse(text, highlights) {
  let result = escHtml(text).replace(/\n/g, '<br>');
  for (const h of (highlights || [])) {
    if (!h.quote || !h.quote.trim()) continue;
    const escaped = escHtml(h.quote);
    const cls     = h.type === 'gut' ? 'hl-gut' : 'hl-schlecht';
    const title   = escHtml(h.reason || '');
    result = result.replace(escaped, `<mark class="${cls}" title="${title}">${escaped}</mark>`);
  }
  return result;
}

function renderSimPair(pair, index, container) {
  const { utterance, aiResponse, evaluation } = pair;
  const ev           = evaluation || {};
  const overallClass = `sim-overall-${ev.overall || 'gemischt'}`;
  const scoreStars   = '⭐'.repeat(Math.max(1, Math.min(5, ev.score || 3)));

  const el = document.createElement('div');
  el.className = 'sim-pair';
  el.innerHTML = `
    <div class="sim-pair-header">
      <span>Äußerung ${index + 1}</span>
      <span class="${overallClass}">${ev.overall || 'gemischt'}</span>
      <span class="sim-score">${scoreStars}</span>
    </div>
    <div class="sim-utterance">${escHtml(utterance)}</div>
    <div class="sim-response">${highlightResponse(aiResponse, ev.highlights)}</div>
    ${ev.summary ? `<div class="sim-summary">💬 ${escHtml(ev.summary)}</div>` : ''}`;
  container.appendChild(el);
}

// Issue #27: Simulations-Vorschlag editierbar + direkt speicherbar
function renderSimSuggestion(ev, container) {
  const text = ev.erfahrungsprompt_neu || '';
  container.innerHTML = '';

  const wrapper = document.createElement('div');

  const h4 = document.createElement('h4');
  h4.textContent = '✅ Erfahrungsprompt-Vorschlag (basierend auf dieser Simulation)';

  const ta = document.createElement('textarea');
  ta.rows = 6;
  ta.style.cssText = 'width:100%;box-sizing:border-box;font-size:13px;border:1px solid #b2d9b2;border-radius:4px;padding:8px;background:white;resize:vertical';
  ta.value = text;

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:12px;color:#27ae60;margin-top:4px;min-height:16px';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'settings-btn';
  saveBtn.textContent = 'Als Erfahrungsprompt speichern';
  saveBtn.style.background = '#27ae60';
  saveBtn.addEventListener('click', async () => {
    try {
      await apiFetch(`/api/erfahrungsprompt/${encodeURIComponent(activityId)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: ta.value }),
      });
      statusEl.textContent = '✓ Gespeichert.';
      optimizeLoaded = false;
    } catch (e) { statusEl.style.color = '#c0392b'; statusEl.textContent = '⚠ ' + e.message; }
  });

  const adoptBtn = document.createElement('button');
  adoptBtn.className = 'sim-adopt-btn';
  adoptBtn.textContent = 'In Optimierungsvorschlag übernehmen';
  adoptBtn.addEventListener('click', () => {
    const neuField = document.getElementById('opt-neu');
    if (neuField) {
      neuField.value = ta.value;
      document.getElementById('opt-result').style.display = 'flex';
      document.getElementById('opt-proposal-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center';
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(adoptBtn);
  btnRow.appendChild(statusEl);

  wrapper.appendChild(h4);
  wrapper.appendChild(ta);
  attachExpandBtn(ta, 'Erfahrungsprompt-Vorschlag');
  wrapper.appendChild(btnRow);
  container.appendChild(wrapper);
}

// ── Optimierungs-Panel (Issue #20) ────────────────────────────────────────────

let optimizeLoaded = false;

async function loadOptimizePanel() {
  if (optimizeLoaded) return;
  optimizeLoaded = true;
  await loadErfahrungsprompt();
  await loadErfahrungspromptHistory();
}

async function loadErfahrungsprompt() {
  try {
    const data = await apiFetch(`/api/erfahrungsprompt/${encodeURIComponent(activityId)}`);
    document.getElementById('erf-current').value = data.content || '';
  } catch (e) { console.warn('[Optimize] Erfahrungsprompt Ladefehler:', e); }
}

async function loadErfahrungspromptHistory() {
  try {
    const data   = await apiFetch(`/api/erfahrungsprompt-history/${encodeURIComponent(activityId)}`);
    const list   = document.getElementById('erf-history-list');
    const status = document.getElementById('erf-save-status');
    list.innerHTML = '';
    const latestId = data.history[0]?.id;
    for (const h of data.history) {
      const d = document.createElement('div');
      d.className = 'history-item';
      const deleteBtn = h.id !== latestId
        ? `<button class="history-delete-btn" data-id="${h.id}">Löschen</button>`
        : '';
      d.innerHTML = `
        <div class="history-meta">
          v${h.version} · ${formatTime(h.created_at)} · ${escHtml(h.created_by || '–')}
          <button class="history-expand-btn">Anzeigen</button>${deleteBtn}
        </div>
        <div class="history-content">${escHtml(h.content || '')}</div>`;
      list.appendChild(d);
    }
    list.querySelectorAll('.history-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const content = btn.closest('.history-item').querySelector('.history-content');
        content.classList.toggle('expanded');
        btn.textContent = content.classList.contains('expanded') ? 'Ausblenden' : 'Anzeigen';
      });
    });
    list.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await apiDelete(`/api/erfahrungsprompt-history/${id}?activityId=${encodeURIComponent(activityId)}`);
          await loadErfahrungspromptHistory();
          setStatus(status, 'Eintrag gelöscht.');
        } catch (e) { setStatus(status, e.message, true); }
      });
    });
  } catch (e) { console.warn('[Optimize] History Ladefehler:', e); }
}

// Manuell speichern
document.getElementById('erf-save-btn').addEventListener('click', async () => {
  const content = document.getElementById('erf-current').value;
  const status  = document.getElementById('erf-save-status');
  try {
    await apiFetch(`/api/erfahrungsprompt/${encodeURIComponent(activityId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setStatus(status, 'Erfahrungsprompt gespeichert.');
    optimizeLoaded = false;
    await loadErfahrungspromptHistory();
    optimizeLoaded = true;
  } catch (e) { setStatus(status, e.message, true); }
});

// KI-Vorschlag generieren
document.getElementById('opt-generate-btn').addEventListener('click', async () => {
  const loading = document.getElementById('opt-loading');
  const result  = document.getElementById('opt-result');
  const genBtn  = document.getElementById('opt-generate-btn');
  loading.classList.add('visible');
  genBtn.disabled = true;
  result.style.display = 'none';
  document.getElementById('opt-confirm-status').textContent = '';

  try {
    const data = await apiFetch(`/api/optimize-prompt?activityId=${encodeURIComponent(activityId)}`, {
      method: 'POST',
    });
    document.getElementById('opt-alt').value = data.erfahrungsprompt_alt || '(leer)';
    document.getElementById('opt-neu').value = data.erfahrungsprompt_neu || '';
    renderKausalkette(data.kausalkette || []);
    result.style.display = 'flex';
  } catch (e) {
    setStatus(document.getElementById('opt-confirm-status'), `Fehler: ${e.message}`, true);
  } finally {
    loading.classList.remove('visible');
    genBtn.disabled = false;
  }
});

function renderKausalkette(items) {
  const container = document.getElementById('opt-kausalkette');
  container.innerHTML = '';
  if (!items.length) {
    container.textContent = 'Keine Kausalkette vom KI generiert.';
    return;
  }
  for (const item of items) {
    const div = document.createElement('div');
    div.className = 'kausalkette-item';
    div.innerHTML = `
      <div class="kk-label">Problem</div><div class="kk-text">${escHtml(item.problem || '–')}</div>
      <div class="kk-label" style="margin-top:5px">Ursache</div><div class="kk-text">${escHtml(item.ursache || '–')}</div>
      <div class="kk-label" style="margin-top:5px">Änderung</div><div class="kk-text">${escHtml(item.aenderung || '–')}</div>`;
    container.appendChild(div);
  }
}

// Bestätigen & speichern
document.getElementById('opt-confirm-btn').addEventListener('click', async () => {
  const content = document.getElementById('opt-neu').value;
  const status  = document.getElementById('opt-confirm-status');
  try {
    // 1. Erfahrungsprompt speichern
    await apiFetch(`/api/erfahrungsprompt/${encodeURIComponent(activityId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    // 2. Kausalkette als Erkenntnisse speichern
    const kkItems = Array.from(document.querySelectorAll('#opt-kausalkette .kausalkette-item')).map(el => {
      const texts = el.querySelectorAll('.kk-text');
      return {
        problem:  texts[0]?.textContent || '',
        ursache:  texts[1]?.textContent || '',
        aenderung: texts[2]?.textContent || '',
      };
    });
    if (kkItems.length) {
      await apiFetch(`/api/erkenntnisse?activityId=${encodeURIComponent(activityId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: kkItems }),
      });
    }

    // Aktuellen Erfahrungsprompt aktualisieren
    document.getElementById('erf-current').value = content;
    document.getElementById('opt-result').style.display = 'none';
    setStatus(status, 'Gespeichert. Erkenntnisse übernommen.');
    optimizeLoaded = false;
    await loadErfahrungspromptHistory();
    optimizeLoaded = true;
  } catch (e) { setStatus(status, e.message, true); }
});

// Verwerfen
document.getElementById('opt-discard-btn').addEventListener('click', () => {
  document.getElementById('opt-result').style.display = 'none';
  document.getElementById('opt-confirm-status').textContent = '';
});

// ── P7: One-Click Optimierung ─────────────────────────────────────────────────

document.getElementById('one-click-btn').addEventListener('click', runOneClick);

async function runOneClick() {
  const loading  = document.getElementById('one-click-loading');
  const progress = document.getElementById('one-click-progress');
  const bar      = document.getElementById('one-click-progress-bar');
  const status   = document.getElementById('one-click-status');
  const btn      = document.getElementById('one-click-btn');

  loading.classList.add('visible');
  btn.disabled = true;
  status.textContent = '';
  bar.style.width = '0%';
  progress.textContent = 'Starte…';

  const pairsTotal = 16;
  let   pairsEmitted = 0;

  function setProgress(pct, label) {
    bar.style.width = pct + '%';
    progress.textContent = label;
  }

  try {
    const response = await fetch(
      `/api/one-click-optimize?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }

        if (ev.type === 'criteria') {
          const msg = ev.added > 0
            ? `Kriterien: ${ev.total - ev.added} vorhanden, ${ev.added} ergänzt (${ev.total} gesamt)`
            : `Kriterien: ${ev.total} vorhanden`;
          setProgress(8, msg);
        } else if (ev.type === 'personas') {
          setProgress(12, `Personas: ${ev.selected.join(', ')}`);
        } else if (ev.type === 'sim_start') {
          setProgress(15, `Simulation startet (${ev.total} Paare)…`);
        } else if (ev.type === 'sim_pair') {
          pairsEmitted++;
          const pct = 15 + Math.round((pairsEmitted / pairsTotal) * 70);
          setProgress(pct, `Simulation: ${pairsEmitted}/${pairsTotal} Paare (${escHtml(ev.personaName)})`);
        } else if (ev.type === 'optimize_done') {
          setProgress(100, 'Fertig – Vorschlag generiert.');
          document.getElementById('opt-alt').value = ev.erfahrungsprompt_alt || '(leer)';
          document.getElementById('opt-neu').value = ev.erfahrungsprompt_neu || '';
          renderKausalkette(ev.kausalkette || []);
          document.getElementById('opt-result').style.display = 'flex';
          document.getElementById('opt-proposal-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setStatus(status, 'Vorschlag bereit – bitte prüfen und bestätigen.');
          simulateLoaded = false;
          await loadCriteria();
          simulateLoaded = true;
        } else if (ev.type === 'error') {
          setStatus(status, `Fehler: ${ev.message}`, true);
        }
      }
    }
  } catch (e) {
    setStatus(status, `Fehler: ${e.message}`, true);
  } finally {
    loading.classList.remove('visible');
    btn.disabled = false;
  }
}

document.getElementById('add-admin-btn').addEventListener('click', async () => {
  const input  = document.getElementById('new-admin-input');
  const status = document.getElementById('admin-status');
  const uid    = input.value.trim();
  if (!uid) return setStatus(status, 'Bitte eine User-ID eingeben.', true);
  try {
    const data = await apiPost('/api/admin/admins', { newUserId: uid });
    renderAdminList(data.admins);
    input.value = '';
    setStatus(status, `${uid} als Admin eingetragen.`);
  } catch (e) { setStatus(status, e.message, true); }
});

document.getElementById('st-save-btn').addEventListener('click', async () => {
  const status = document.getElementById('st-save-status');
  const body   = {
    title:         document.getElementById('st-title').value,
    botIcon:       document.getElementById('st-bot-icon').value,
    opener:        document.getElementById('st-opener').value,
    uploadMode:    document.getElementById('st-upload-mode').value,
    hintsTemplate: document.getElementById('st-hints').value,
  };
  try {
    await apiPut('/api/admin/system-template', body);
    setStatus(status, '✓ Systemvorlage gespeichert');
  } catch (e) { setStatus(status, e.message, true); }
});

// ── Textarea-Vollbild-Overlay ─────────────────────────────────────────────────

const _overlay      = document.getElementById('textarea-overlay');
const _overlayBody  = document.getElementById('overlay-body');
const _overlayTa    = document.getElementById('overlay-textarea');
const _overlayLabel = document.getElementById('overlay-label');
let   _sourceTa     = null;

function _resizeOverlayTa() {
  _overlayTa.style.height = 'auto';
  const minH = _overlayBody.clientHeight;
  _overlayTa.style.height = Math.max(minH, _overlayTa.scrollHeight) + 'px';
}

_overlayTa.addEventListener('input', _resizeOverlayTa);

function _getLabelForTextarea(ta) {
  // Nearest .opt-diff-label sibling (for opt-alt / opt-neu)
  let el = ta.previousElementSibling;
  while (el) {
    if (el.classList.contains('opt-diff-label')) return el.textContent.trim();
    el = el.previousElementSibling;
  }
  // h3 of the closest .settings-card
  const card = ta.closest('.settings-card');
  if (card) {
    const h3 = card.querySelector('h3');
    if (h3) return h3.textContent.trim();
  }
  return ta.placeholder || 'Textfeld';
}

function _openOverlay(ta, label) {
  _sourceTa                 = ta;
  _overlayTa.value          = ta.value;
  _overlayTa.readOnly       = ta.readOnly;
  _overlayLabel.textContent = label || _getLabelForTextarea(ta);
  _overlayTa.style.height   = 'auto';
  _overlay.classList.add('visible');
  requestAnimationFrame(() => {
    _resizeOverlayTa();
    _overlayTa.focus();
    const len = _overlayTa.value.length;
    _overlayTa.setSelectionRange(len, len);
  });
}

function _closeOverlay() {
  if (_sourceTa && !_sourceTa.readOnly) _sourceTa.value = _overlayTa.value;
  _overlay.classList.remove('visible');
  _sourceTa = null;
}

function attachExpandBtn(ta, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ta-wrapper';
  ta.parentNode.insertBefore(wrapper, ta);
  wrapper.appendChild(ta);

  const btn = document.createElement('button');
  btn.className   = 'ta-expand-btn';
  btn.type        = 'button';
  btn.title       = 'Vollbild';
  btn.textContent = '⛶';
  btn.addEventListener('click', e => { e.preventDefault(); _openOverlay(ta, label); });
  wrapper.appendChild(btn);
}

document.getElementById('overlay-close').addEventListener('click', _closeOverlay);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _overlay.classList.contains('visible')) _closeOverlay();
});

document.querySelectorAll('.settings-textarea').forEach(ta => attachExpandBtn(ta));
