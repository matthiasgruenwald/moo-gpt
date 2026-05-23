// settings.js — Einstellungen-Seite für moo-gpt Dashboard

// ── URL-Parameter ─────────────────────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search);
const token      = params.get('token') || '';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function parseUTC(str) {
  if (!str) return new Date(0);
  return new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d   = parseUTC(isoStr);
    const now = new Date();
    const tz  = { timeZone: 'Europe/Berlin' };
    const time = d.toLocaleTimeString('de-DE', { ...tz, hour: '2-digit', minute: '2-digit' });
    const sameDay = d.toLocaleDateString('de-DE', tz) === now.toLocaleDateString('de-DE', tz);
    if (sameDay) return time;
    return d.toLocaleDateString('de-DE', { ...tz, day: '2-digit', month: '2-digit' }) + ' ' + time;
  } catch { return isoStr; }
}

function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.className   = 'status-msg' + (isError ? ' error' : '');
  if (msg && !isError) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r   = await fetch(`${path}${sep}token=${encodeURIComponent(token)}`, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
  return r.json();
}
const apiGet    = path         => apiFetch(path);
const apiPut    = (path, body) => apiFetch(path, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const apiPost   = (path, body) => apiFetch(path, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const apiDelete = path         => apiFetch(path, { method: 'DELETE' });

// ── DOM-Referenzen ────────────────────────────────────────────────────────────
const settingsPanel = document.getElementById('settings-panel');
const infoPanel     = document.getElementById('info-panel');
const adminPanel    = document.getElementById('admin-panel');
const adminTabBtn   = document.getElementById('admin-tab-btn');
const tabBtns       = document.querySelectorAll('.tab-btn');

// ── Tab-Navigation ────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    settingsPanel.classList.toggle('visible', tab === 'settings');
    infoPanel.classList.toggle('visible',     tab === 'info');
    adminPanel.classList.toggle('visible',    tab === 'admin');
    if (tab === 'settings' || tab === 'admin') loadSettings();
    if (tab === 'info')                        initMermaidOnce();
  });
});

// ── Info-Tab: Sub-Tabs + Mermaid ──────────────────────────────────────────────
let mermaidReady = false;
async function initMermaidOnce() {
  if (mermaidReady) return;
  mermaidReady = true;
  const els = [...document.querySelectorAll('pre.mermaid')];
  for (let i = 0; i < els.length; i++) {
    const el     = els[i];
    const source = el.textContent.trim();
    try {
      const { svg } = await mermaid.render('mermaid-diag-' + i, source);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = svg;
      el.replaceWith(wrapper);
    } catch { el.textContent = 'Diagramm konnte nicht gerendert werden.'; }
  }
}

infoPanel.querySelectorAll('.sub-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const subtab = btn.dataset.subtab;
    infoPanel.querySelectorAll('.sub-tab-content').forEach(el => { el.style.display = 'none'; });
    infoPanel.querySelector(`#subtab-${subtab}`).style.display = '';
    infoPanel.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (subtab === 'architektur') initMermaidOnce();
  });
});

// ── Settings laden ────────────────────────────────────────────────────────────
let settingsLoaded = false;
let settingsData   = null;

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
  document.getElementById('sp-display').value                 = data.systemPrompt || '';
  document.getElementById('global-model-display').textContent = data.model || '–';

  const mySelect = document.getElementById('my-model-select');
  mySelect.innerHTML = `<option value="">Standard (${escHtml(data.model)})</option>`;
  for (const m of data.availableModels) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === data.myModel) opt.selected = true;
    mySelect.appendChild(opt);
  }

  if (!data.isAdmin) return;

  adminTabBtn.style.display = '';
  document.getElementById('sp-admin-section').style.display     = 'flex';
  document.getElementById('sp-history-details').style.display   = '';
  document.getElementById('admin-personas-card').style.display  = '';
  document.getElementById('system-template-card').style.display = '';
  loadAdminPersonas();
  initAdminDebug();

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

// ── Versionshistorie (Systemprompt) ───────────────────────────────────────────
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

// ── Systemvorlage speichern ───────────────────────────────────────────────────
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

// ── Admin-Personas ────────────────────────────────────────────────────────────
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
    opt.value = n; opt.textContent = n;
    if (n === selectedName) opt.selected = true;
    filter.appendChild(opt);
  }

  const filtered = selectedName
    ? personas.filter(p => (p.teacher_name || p.teacher_id) === selectedName)
    : personas;
  list.innerHTML = filtered.length
    ? ''
    : '<p style="font-size:13px;color:#aaa;margin:4px 0">Keine Lehrer-Personas vorhanden.</p>';

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
    await loadAdminPersonas();
  } catch (e) {
    setStatus(document.getElementById('admin-personas-status'), `Fehler: ${e.message}`, true);
  }
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
  const card = ta.closest('.settings-card');
  if (card) { const h3 = card.querySelector('h3'); if (h3) return h3.textContent.trim(); }
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

function attachExpandBtn(ta) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ta-wrapper';
  ta.parentNode.insertBefore(wrapper, ta);
  wrapper.appendChild(ta);
  const btn = document.createElement('button');
  btn.className = 'ta-expand-btn'; btn.type = 'button'; btn.title = 'Vollbild'; btn.textContent = '⛶';
  btn.addEventListener('click', e => { e.preventDefault(); _openOverlay(ta); });
  wrapper.appendChild(btn);
}

document.getElementById('overlay-close').addEventListener('click', _closeOverlay);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _overlay.classList.contains('visible')) _closeOverlay();
});

// ── Admin-Debug: Logs + Restart ───────────────────────────────────────────────
function initAdminDebug() {
  const logOut        = document.getElementById('log-output');
  const logOverlay    = document.getElementById('log-overlay');
  const logOverlayPre = document.getElementById('log-overlay-pre');
  const logStatus     = document.getElementById('debug-status');
  const wrapBtn       = document.getElementById('log-wrap-btn');
  const ovWrapBtn     = document.getElementById('log-overlay-wrap-btn');
  let logWrap = true;
  let autoInterval = null;

  async function loadLogs() {
    const n = Math.min(Math.max(parseInt(document.getElementById('log-n-input').value) || 100, 1), 2000);
    try {
      const data = await apiFetch(`/api/admin/logs?n=${n}`);
      const text = data.lines.join('\n');
      logOut.textContent = text;
      if (logOverlay.classList.contains('visible')) logOverlayPre.textContent = text;
      requestAnimationFrame(() => { logOut.scrollTop = logOut.scrollHeight; });
      setStatus(logStatus, `${data.lines.length} Zeilen geladen`);
    } catch (e) { setStatus(logStatus, e.message, true); }
  }

  function applyWrap(on) {
    logWrap = on;
    const ws = on ? 'pre-wrap' : 'pre';
    const wb = on ? 'break-all' : 'normal';
    logOut.style.whiteSpace        = ws;
    logOut.style.wordBreak         = wb;
    logOverlayPre.style.whiteSpace = ws;
    logOverlayPre.style.wordBreak  = wb;
    wrapBtn.textContent   = on ? '↵' : '→';
    ovWrapBtn.textContent = on ? '↵ an' : '→ aus';
  }

  document.getElementById('log-refresh-btn').addEventListener('click', loadLogs);
  document.getElementById('log-auto-refresh').addEventListener('change', e => {
    clearInterval(autoInterval);
    if (e.target.checked) autoInterval = setInterval(loadLogs, 30_000);
  });
  wrapBtn.addEventListener('click',   () => applyWrap(!logWrap));
  ovWrapBtn.addEventListener('click', () => applyWrap(!logWrap));
  document.getElementById('log-expand-btn').addEventListener('click', () => {
    logOverlayPre.textContent = logOut.textContent;
    logOverlay.classList.add('visible');
  });
  document.getElementById('log-overlay-close').addEventListener('click', () => {
    logOverlay.classList.remove('visible');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && logOverlay.classList.contains('visible'))
      logOverlay.classList.remove('visible');
  });
  document.getElementById('server-restart-btn').addEventListener('click', async () => {
    if (!confirm('Server wirklich neu starten?')) return;
    try {
      await apiPost('/api/admin/restart', {});
      setStatus(logStatus, 'Neustart eingeleitet – Seite lädt in 5s neu…');
      setTimeout(() => location.reload(), 5000);
    } catch (e) { setStatus(logStatus, e.message, true); }
  });

  loadLogs();
}

// ── Initialisierung ───────────────────────────────────────────────────────────
document.querySelectorAll('.settings-textarea').forEach(ta => attachExpandBtn(ta));
loadSettings();
