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

// ── State ────────────────────────────────────────────────────────────────────
let students                = [];          // aktuelle Schülerliste (sortiert)
let selectedThreadId        = null;        // aktuell angezeigter Thread
let ws                      = null;
let sortMode                = 'activity';  // 'activity' | 'name'
const liveSince             = new Map();   // threadDbId → timestamp letzter Live-Nachricht
let activityOpener          = '';          // Opener-Text der Aufgabe
let hasConnectedSuccessfully = false;      // war schon mal gültig verbunden?
let fatalError              = false;       // kein Reconnect mehr
let activityCost            = null;        // Issue #12: Aktivitäts-Gesamtkosten
let currentThreadCost       = null;        // Issue #12: Kosten des aktuell geöffneten Chats

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
const sortSelect     = document.getElementById('sort-select');
const initialError   = document.getElementById('initial-error');
const expiredOverlay = document.getElementById('expired-overlay');
const costBar        = document.getElementById('cost-bar');
const costBarInput   = document.getElementById('cost-bar-input');
const costBarOutput  = document.getElementById('cost-bar-output');
const costBarTotal   = document.getElementById('cost-bar-total');

// ── Initialisierung ───────────────────────────────────────────────────────────
if (!activityId || !token) {
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
  selectedThreadId  = null;
  currentThreadCost = null;
  document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
  renderChatCost(null);
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
          runCost, threadCost, activityCost: newActivityCost } = msg;

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
    // Nachricht anhängen (mit runCost für Assistenten-Antwort)
    appendMessage({ role, content, content_type: contentType || 'text', created_at: createdAt, runCost });
    scrollToBottom();
  }
}

// ── Schülerliste rendern ──────────────────────────────────────────────────────
function renderStudentList() {
  const sorted = [...students].sort((a, b) => {
    if (sortMode === 'name') {
      return (a.moodle_user_name || '').localeCompare(b.moodle_user_name || '', 'de');
    }
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
    for (const m of sess) appendMessage(m);
  }
  scrollToBottom();
}

function renderMsgContent(role, content, contentType) {
  if (role === 'user') {
    if (contentType === 'image' || contentType === 'pdf') {
      if (content && content.startsWith('data:')) {
        const label = contentType === 'pdf'
          ? '<div style="font-size:11px;opacity:0.6;margin-top:2px">📄 PDF-Seite</div>' : '';
        return `<img src="${content}" style="max-width:200px;border-radius:6px;display:block;" class="dash-lb-trigger" onclick="openLightbox(this.src)">${label}`;
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
 */
function appendMessage({ role, content, content_type, created_at, runCost }) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${role}`;
  bubble.innerHTML = renderMsgContent(role, content, content_type);

  const time = document.createElement('div');
  time.className = 'msg-time';
  // Issue #12: Kosten in derselben Zeile wie Uhrzeit (nur Assistenten-Antworten)
  if (role === 'assistant' && runCost) {
    time.textContent = `${formatTime(created_at)}  ↑ ${formatCost(runCost.inputEur)} ↓ ${formatCost(runCost.outputEur)}`;
    time.title = 'Uhrzeit  ·  Kosten: Eingabe / Ausgabe';
  } else {
    time.textContent = formatTime(created_at);
  }

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

function simpleMarkdown(text) {
  let html = escHtml(text);
  html = html.replace(/```[\s\S]*?```/g, m => `<pre>${m.slice(3, -3).trim()}</pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
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
    return parseUTC(isoStr).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
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
