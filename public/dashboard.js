/**
 * dashboard.js – Teacher-Dashboard für MMBbS GPT (Issue #5)
 *
 * Lädt die Schülerliste via WebSocket, zeigt Chat-Verläufe und
 * empfängt Live-Updates wenn Schüler neue Nachrichten senden.
 */

// ── URL-Parameter ────────────────────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search);
const activityId = params.get('activityId') || '';
const token      = params.get('token')      || '';

// ── State ────────────────────────────────────────────────────────────────────
let students                = [];          // aktuelle Schülerliste (sortiert)
let selectedThreadId        = null;        // aktuell angezeigter Thread
let ws                      = null;
let sortMode                = 'activity';  // 'activity' | 'name'
const liveSince             = new Map();   // threadDbId → timestamp letzter Live-Nachricht
let activityOpener          = '';          // Opener-Text der Aufgabe
let hasConnectedSuccessfully = false;      // war schon mal gültig verbunden?
let fatalError              = false;       // kein Reconnect mehr

// ── DOM-Referenzen ───────────────────────────────────────────────────────────
const statusDot      = document.getElementById('status-dot');
const liveBadge      = document.getElementById('live-badge');
const pageTitle      = document.getElementById('page-title');
const studentList    = document.getElementById('student-list');
const studentCount   = document.getElementById('student-count');
const chatPanel      = document.getElementById('chat-panel');
const listPanel      = document.getElementById('list-panel');
const chatTitle      = document.getElementById('chat-title');
const chatMessages   = document.getElementById('chat-messages');
const backBtn        = document.getElementById('back-btn');
const sortSelect     = document.getElementById('sort-select');
const initialError   = document.getElementById('initial-error');
const expiredOverlay = document.getElementById('expired-overlay');

// ── Initialisierung ───────────────────────────────────────────────────────────
if (!activityId || !token) {
  // Kein Token in URL → saubere Fehlerseite, keine Dashboard-Struktur
  initialError.classList.add('visible');
} else {
  connectWebSocket();
}

sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  renderStudentList();
});

backBtn.addEventListener('click', () => {
  chatPanel.classList.remove('mobile-visible');
  listPanel.classList.remove('hidden');
  selectedThreadId = null;
  document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
});

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
    if (fatalError) return;   // Token abgelaufen – kein Reconnect
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
      renderStudentList();
      break;

    case 'messages':
      // Antwort auf getMessages-Anfrage
      renderChatView(msg.student, msg.data);
      break;

    case 'newMessage':
      handleNewMessage(msg);
      break;

    case 'error':
      console.warn('[Dashboard] Server-Fehler:', msg.message);
      if (msg.message === 'Unauthorized') {
        fatalError = true;
        if (!hasConnectedSuccessfully) {
          // Noch nie verbunden gewesen → saubere Fehlerseite
          initialError.classList.add('visible');
        } else {
          // War verbunden, Token abgelaufen → Overlay über bestehendem Dashboard
          expiredOverlay.classList.add('visible');
        }
      }
      break;
  }
}

// ── Neue Live-Nachricht ───────────────────────────────────────────────────────
function handleNewMessage(msg) {
  const { threadDbId, userId: uid, userName, role, content, contentType, createdAt } = msg;

  // Schülerliste aktualisieren (Zähler + Zeitstempel)
  const student = students.find(s => s.thread_db_id === threadDbId);
  if (student) {
    if (role === 'user') student.message_count++;
    student.updated_at = createdAt;
    liveSince.set(threadDbId, Date.now());
  } else {
    // Neuer Schüler – Initialliste neu anfordern
    students.push({
      thread_db_id:    threadDbId,
      moodle_user_id:  uid,
      moodle_user_name: userName || '–',
      updated_at:      createdAt,
      message_count:   role === 'user' ? 1 : 0,
    });
    liveSince.set(threadDbId, Date.now());
  }
  renderStudentList();

  // Wenn dieser Schüler gerade offen ist → Nachricht direkt anhängen
  if (selectedThreadId === threadDbId) {
    appendMessage({ role, content, content_type: contentType || 'text', created_at: createdAt });
    scrollToBottom();
  }
}

// ── Schülerliste rendern ──────────────────────────────────────────────────────
function renderStudentList() {
  const sorted = [...students].sort((a, b) => {
    if (sortMode === 'name') {
      return (a.moodle_user_name || '').localeCompare(b.moodle_user_name || '', 'de');
    }
    // Letzte Aktivität (neueste oben)
    return new Date(b.updated_at) - new Date(a.updated_at);
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

    item.innerHTML = `
      <div class="student-name">
        ${isLive ? '<span class="badge-new"></span>' : ''}
        ${escHtml(s.moodle_user_name || `Schüler (ID ${s.moodle_user_id})`)}
        <span class="msg-count">${s.message_count}</span>
      </div>
      <div class="student-meta">
        <span>🕐 ${relTime(s.updated_at)}</span>
      </div>`;

    item.addEventListener('click', () => selectStudent(s));
    studentList.appendChild(item);
  }
}

// ── Schüler auswählen ─────────────────────────────────────────────────────────
function selectStudent(student) {
  selectedThreadId = student.thread_db_id;

  // Live-Badge zurücksetzen
  liveSince.delete(student.thread_db_id);

  // Aktiv-Klasse setzen
  document.querySelectorAll('.student-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.threadId) === student.thread_db_id);
  });

  // Mobile: Panel wechseln
  if (window.innerWidth < 768) {
    listPanel.classList.add('hidden');
    chatPanel.classList.add('mobile-visible');
  }

  chatTitle.textContent = student.moodle_user_name || '–';
  chatMessages.innerHTML = '<div class="loading">Lade Nachrichten…</div>';

  // Nachrichten über WS anfordern
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

/**
 * Teilt eine Nachrichtenliste in Sessions auf.
 * Eine neue Session beginnt, wenn die Pause zum vorherigen Eintrag > gapMs ist.
 */
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

/** Erzeugt den Session-Header-Text (Lehrer-Ansicht mit Dauer + Anzahl). */
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

  // Opener anzeigen
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

  // Nachrichten in Sessions gruppieren und mit Header ausgeben
  const sessions = splitIntoSessions(messages);
  for (const sess of sessions) {
    appendSessionHeader(sess);
    for (const m of sess) appendMessage(m);
  }
  scrollToBottom();
}

function renderMsgContent(role, content, contentType) {
  if (role === 'user') {
    if (contentType === 'image') {
      if (content && content.startsWith('data:')) {
        return `<img src="${content}" style="max-width:200px;border-radius:6px;display:block;">`;
      }
      return '📷 <em>Bild (extern gespeichert, ~30 Tage)</em>';
    }
    if (contentType === 'pdf') {
      return '📄 <em>PDF-Upload (1 Seite)</em>';
    }
    return simpleMarkdown(content);
  }
  return simpleMarkdown(content);
}

function appendMessage({ role, content, content_type, created_at }) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${role}`;
  bubble.innerHTML = renderMsgContent(role, content, content_type);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(created_at);

  wrap.appendChild(bubble);
  wrap.appendChild(time);
  chatMessages.appendChild(wrap);
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

/**
 * Minimales Markdown: Code-Blöcke, Fettschrift, Zeilenumbrüche.
 * (Kein vollständiges Markdown – reicht für Chat-Anzeige.)
 */
function simpleMarkdown(text) {
  let html = escHtml(text);
  // Fenced code blocks
  html = html.replace(/```[\s\S]*?```/g, m => `<pre>${m.slice(3, -3).trim()}</pre>`);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Fettschrift
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Zeilenumbrüche
  html = html.replace(/\n/g, '<br>');
  return html;
}

function relTime(isoStr) {
  if (!isoStr) return '–';
  const diff = Date.now() - new Date(isoStr).getTime();
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
    return parseUTC(isoStr).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

// Live-Badges alle 30 s neu rendern (relTime aktualisieren)
setInterval(renderStudentList, 30_000);
