import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/+esm";
import renderMathInElement from "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.mjs";
import prismEs6 from "https://cdn.jsdelivr.net/npm/prism-es6@1.2.0/+esm";

// Load language java for syntax highlighting
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-java.min.js";
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-python.min.js";
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-json.min.js";

export class MOOBOT {
  constructor(settings) {
    // P5a: nur host/protocol/port aus dem Snippet verwenden
    this.settings = {
      host:     settings.host,
      protocol: settings.protocol,
      port:     settings.port,
    };
    this.msgCount = 0;
    this.ws = null;
    this.wsInitialized = false;
    this.dashboardToken          = null;  // Issue #5: vom Server zugewiesen
    this.pendingDashboardOpen    = false; // Issue #5: Dashboard-Tab nach Token-Empfang öffnen
    this.pendingDashboardWindow  = null;  // Issue #5: vorab geöffnetes about:blank-Fenster
    this._pendingConfigOpen      = false; // P5: Config-Overlay nach Token-Empfang öffnen
    this._pasteListenerAdded     = false;
    this._dragListenerAdded      = false;
    this._positionSide           = sessionStorage.getItem('moogpt-side') === 'left' ? 'left' : 'right';
    this._locked                 = false;
    this.marked = marked;
    this.katex = katex;
    this.renderMathInElement = renderMathInElement;
    this.prismEs6 = prismEs6;

    this.init();
  }

  async init() {
    try {
      this.loadExternalLibraries();
      this.createChatInterface();
      // P5a: WS sofort verbinden, damit Config + Badge vor Chat-Öffnen ankommen
      this.setupWebSocket();
      this.wsInitialized = true;
    } catch (error) {
      console.error("Error loading libraries:", error);
    }
  }

  createChatInterface() {
    console.log("createChatInterface");

    // Load CSS
    const head = document.querySelector("head");
    const css = document.createElement("link");
    css.href = `${this._baseUrl()}/styles.css`;
    css.rel = "stylesheet";
    head.appendChild(css);

    // Issue #4 / #5: Rollenerkennung früh (sync) – wird in setupWebSocket bestätigt
    const hasEditMode = document.querySelector('form[action*="editmode.php"]') !== null;
    const isSwitchedRole = document.body.className.includes('userswitchedrole');
    const isTeacher = hasEditMode && !isSwitchedRole;
    this.settings.isTeacher = isTeacher;

    // Create chat icon — P5a: Dateiname kommt via _applyConfig, Fallback grw.png
    const chatIcon = document.createElement("div");
    const icon = this._iconUrl('grw');
    chatIcon.id = "chat-icon";
    chatIcon.className = "chat-icon";
    chatIcon.innerHTML = '<img src="' + icon + '" alt="Chat Icon">';
    chatIcon.onclick = this.toggleChat.bind(this);

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.className = "chat-container";

    // Create chat header
    const chatHeader = document.createElement("div");
    chatHeader.className = "chat-header";
    chatHeader.innerHTML = `
        <div class="chat-header-icon-container">
            <img src="${icon}" alt="Chat Icon" class="chat-header-icon">
        </div>
        <h1>MMBbS GPT</h1>
        <button class="header-side-toggle" id="side-toggle-btn" title="Widget links/rechts wechseln" aria-label="Position wechseln">&#8644;</button>
        <div class="header-icon" onclick="toggleChat()">
            <img src="${this._baseUrl()}/close-icon.png" alt="Close Icon">
        </div>`;
    chatContainer.appendChild(chatHeader);

    // Create chat window — P5a: Opener wird durch _applyConfig gesetzt
    const chatWindow = document.createElement("div");
    chatWindow.id = "chat-window";
    chatWindow.className = "chat-window";
    chatContainer.appendChild(chatWindow);

    // Create input container — P5a: Upload-Modus wird durch _applyConfig gesetzt
    const inputContainer = document.createElement("div");
    inputContainer.className = "input-container";
    inputContainer.innerHTML = this._buildInputHTML('off');
    chatContainer.appendChild(inputContainer);

    // Privacy notice
    const privacyNotice = document.createElement("div");
    privacyNotice.className = "privacy-notice";
    privacyNotice.textContent = "🔒 Chats können von Lehrkräften eingesehen werden.";
    chatContainer.appendChild(privacyNotice);

    // Check if main-inner exists
    const mainInner = document.querySelector(".main-inner");

    // Issue #5 + P5: Lehrer-Buttons (Dashboard + Config) über dem Chat-Button
    if (isTeacher) {
      const dashBtn = document.createElement("div");
      dashBtn.id = "dashboard-icon";
      dashBtn.className = "dashboard-icon";
      dashBtn.title = "Schüler-Dashboard öffnen";
      dashBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28">
        <rect x="3" y="3" width="8" height="8" rx="1.5"/>
        <rect x="13" y="3" width="8" height="8" rx="1.5"/>
        <rect x="3" y="13" width="8" height="8" rx="1.5"/>
        <rect x="13" y="13" width="8" height="8" rx="1.5"/>
      </svg>`;
      dashBtn.onclick = () => this.openDashboard();
      document.body.appendChild(dashBtn);

      const cfgBtn = document.createElement("div");
      cfgBtn.id = "config-icon";
      cfgBtn.className = "config-icon";
      cfgBtn.title = "Aktivitäts-Einstellungen";
      cfgBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="26" height="26">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.07 7.07 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.49.49 0 00.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>`;
      cfgBtn.onclick = () => this.openConfig();
      document.body.appendChild(cfgBtn);

      // Issue #43: Stop-Button — Plenumsphase starten
      const stopBtn = document.createElement("div");
      stopBtn.id = "stop-icon";
      stopBtn.className = "stop-icon";
      stopBtn.title = "Plenumsphase starten (Chat sperren)";
      stopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24">
        <rect x="4" y="4" width="16" height="16" rx="3"/>
      </svg>`;
      stopBtn.onclick = () => this._locked ? this._submitUnlock() : this.openLockModal();
      document.body.appendChild(stopBtn);

      // Issue #43: Lock-Modal
      const lockModal = document.createElement("div");
      lockModal.id = "lock-modal";
      lockModal.className = "lock-modal";
      lockModal.innerHTML = `
        <div class="lock-modal-dialog">
          <h2 class="lock-modal-title">&#128274; Plenumsphase starten</h2>
          <p class="lock-modal-desc">Alle Sch&uuml;ler-Chats werden gesperrt.</p>
          <div class="lock-modal-field">
            <label for="lock-duration">Dauer (Minuten, leer&nbsp;= unbegrenzt)</label>
            <input type="number" id="lock-duration" min="1" max="180" placeholder="z.B. 15">
          </div>
          <div class="lock-modal-actions">
            <button class="lock-modal-cancel" id="lock-modal-cancel">Abbrechen</button>
            <button class="lock-modal-confirm" id="lock-modal-confirm">Jetzt sperren</button>
          </div>
        </div>`;
      document.body.appendChild(lockModal);
      lockModal.querySelector('#lock-modal-cancel').onclick = () => this.closeLockModal();
      lockModal.querySelector('#lock-modal-confirm').onclick = () => this._submitLock();
      lockModal.onclick = (e) => { if (e.target === lockModal) this.closeLockModal(); };

      const cfgOverlay = document.createElement("div");
      cfgOverlay.id = "config-overlay";
      cfgOverlay.className = "config-overlay";
      cfgOverlay.innerHTML = `
        <div class="config-overlay-header">
          <h2>&#9881; Aktivit&auml;ts-Einstellungen</h2>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="config-overlay-close" id="config-overlay-side-toggle" title="Links/Rechts wechseln">&#8644;</button>
            <button class="config-overlay-close" id="config-overlay-close">&#x2715;</button>
          </div>
        </div>
        <iframe id="config-overlay-iframe" class="config-overlay-iframe" src=""></iframe>`;
      document.body.appendChild(cfgOverlay);
      cfgOverlay.querySelector('#config-overlay-close').onclick = () => this.closeConfig();
      cfgOverlay.querySelector('#config-overlay-side-toggle').onclick = () => {
        cfgOverlay.classList.toggle('left-side');
        document.getElementById('suggest-panel')?.classList.toggle('left-side');
      };

      const suggestPanel = document.createElement('div');
      suggestPanel.id = 'suggest-panel';
      suggestPanel.className = 'suggest-panel';
      suggestPanel.innerHTML = `
        <div class="suggest-panel-header">
          <span>&#10024; KI-Prompt-Assistent</span>
          <button class="suggest-panel-close" id="suggest-panel-close">&#x2715;</button>
        </div>
        <div class="suggest-panel-messages" id="suggest-panel-messages"></div>
        <div class="suggest-panel-loading" id="suggest-panel-loading">Antwort wird generiert&#8230;</div>
        <div class="suggest-panel-input-row" id="suggest-panel-input-row">
          <input type="text" id="suggest-panel-input" placeholder="Deine Antwort&hellip;" autocomplete="off">
          <button id="suggest-panel-send">Senden</button>
        </div>
        <div class="suggest-panel-preview" id="suggest-panel-preview">
          <div class="suggest-panel-preview-label">Fertiger Prompt</div>
          <div class="suggest-panel-preview-text" id="suggest-panel-preview-text"></div>
          <div class="suggest-panel-preview-actions">
            <button id="suggest-panel-accept">&#10003; &Uuml;bernehmen</button>
            <button id="suggest-panel-discard">Verwerfen</button>
          </div>
        </div>`;
      document.body.appendChild(suggestPanel);

      suggestPanel.querySelector('#suggest-panel-close').onclick = () => {
        suggestPanel.style.display = 'none';
      };
      const spSend = () => {
        const input = document.getElementById('suggest-panel-input');
        const text = input.value.trim();
        if (!text) return;
        const msgs = document.getElementById('suggest-panel-messages');
        const bubble = document.createElement('div');
        bubble.className = 'suggest-smsg-user';
        bubble.textContent = text;
        msgs.appendChild(bubble);
        msgs.scrollTop = msgs.scrollHeight;
        input.value = '';
        document.getElementById('suggest-panel-input-row').style.display = 'none';
        document.getElementById('suggest-panel-loading').style.display = 'flex';
        document.getElementById('config-overlay-iframe')?.contentWindow?.postMessage(
          { type: 'moogpt:suggestReply', text }, '*'
        );
      };
      suggestPanel.querySelector('#suggest-panel-send').onclick = spSend;
      suggestPanel.querySelector('#suggest-panel-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); spSend(); }
      });
      suggestPanel.querySelector('#suggest-panel-accept').onclick = () => {
        const prompt = document.getElementById('suggest-panel-preview-text').textContent;
        document.getElementById('config-overlay-iframe')?.contentWindow?.postMessage(
          { type: 'moogpt:suggestAccept', prompt }, '*'
        );
        suggestPanel.style.display = 'none';
      };
      suggestPanel.querySelector('#suggest-panel-discard').onclick = () => {
        suggestPanel.style.display = 'none';
      };
    }

    // Issue #53: Memory-Button für Schüler
    if (!isTeacher) {
      const memBtn = document.createElement('div');
      memBtn.id = 'memory-icon';
      memBtn.className = 'memory-icon';
      memBtn.title = 'Mein Memory anzeigen';
      memBtn.innerHTML = '&#129504;'; // 🧠
      memBtn.onclick = () => this.openMemoryOverlay();
      document.body.appendChild(memBtn);

      // Issue #53: Memory-Overlay
      const memOverlay = document.createElement('div');
      memOverlay.id = 'memory-overlay';
      memOverlay.className = 'memory-overlay';
      memOverlay.innerHTML = `
        <div class="memory-overlay-dialog">
          <h2 class="memory-overlay-title">&#129504; Mein Memory</h2>
          <p class="memory-overlay-desc">Hier kannst du Notizen f&uuml;r die KI hinterlegen. Sie werden bei jeder Antwort ber&uuml;cksichtigt.</p>
          <textarea class="memory-overlay-textarea" id="memory-overlay-textarea" placeholder="z.B. Ich bevorzuge kurze Erkl&auml;rungen&hellip;" rows="6"></textarea>
          <div class="memory-overlay-actions">
            <button class="memory-overlay-cancel" id="memory-overlay-cancel">Schlie&szlig;en</button>
            <button class="memory-overlay-delete" id="memory-overlay-delete">L&ouml;schen</button>
            <button class="memory-overlay-save" id="memory-overlay-save">Speichern</button>
          </div>
        </div>`;
      document.body.appendChild(memOverlay);
      memOverlay.querySelector('#memory-overlay-cancel').onclick = () => this.closeMemoryOverlay();
      memOverlay.querySelector('#memory-overlay-save').onclick   = () => this._saveMemory();
      memOverlay.querySelector('#memory-overlay-delete').onclick = () => this._deleteMemory();
      memOverlay.onclick = (e) => { if (e.target === memOverlay) this.closeMemoryOverlay(); };
    }

    document.body.appendChild(chatIcon);
    document.body.appendChild(chatContainer);

    // Issue #42: Gespeicherte Seite aus sessionStorage wiederherstellen + Toggle verdrahten
    if (this._positionSide === 'left') {
      chatContainer.classList.add('left-side');
      chatIcon.classList.add('left-side');
      document.getElementById('dashboard-icon')?.classList.add('left-side');
      document.getElementById('config-icon')?.classList.add('left-side');
      document.getElementById('stop-icon')?.classList.add('left-side');
      document.getElementById('memory-icon')?.classList.add('left-side');
    }
    chatHeader.querySelector('#side-toggle-btn').addEventListener('click', () => this._toggleSide());

    // Make toggleChat, sendMessage, and handleKeyDown available globally
    window.toggleChat = this.toggleChat.bind(this);
    window.sendMessage = this.sendMessage.bind(this);
    window.handleKeyDown = this.handleKeyDown.bind(this);

    // P5a: Config-Overlay nach erfolgreichem Speichern schließen + Badge entfernen
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'moogpt:configSaved') {
        this.closeConfig();
        document.getElementById('config-icon')?.querySelector('.cfg-badge')?.remove();
      }
      // Issue #40: Overlay auf Vollbreite erweitern wenn Vergleichs-Panel geöffnet wird
      if (e.data?.type === 'moogpt:expandOverlay') {
        const overlay = document.getElementById('config-overlay');
        if (overlay) {
          overlay.style.width    = '95vw';
          overlay.style.maxWidth = '95vw';
        }
      }
      // Issue #40: Overlay auf ursprüngliche Breite zurücksetzen (CSS-Klasse übernimmt)
      if (e.data?.type === 'moogpt:collapseOverlay') {
        const overlay = document.getElementById('config-overlay');
        if (overlay) {
          overlay.style.width    = '';
          overlay.style.maxWidth = '';
        }
      }
      // Issue #47: Suggest-Panel steuern
      if (e.data?.type === 'moogpt:suggestOpen') {
        const panel = document.getElementById('suggest-panel');
        if (!panel) return;
        document.getElementById('suggest-panel-messages').innerHTML = '';
        document.getElementById('suggest-panel-input-row').style.display = 'none';
        document.getElementById('suggest-panel-preview').style.display = 'none';
        document.getElementById('suggest-panel-loading').style.display = 'flex';
        panel.style.display = 'flex';
      }
      if (e.data?.type === 'moogpt:suggestLoading') {
        const loading = document.getElementById('suggest-panel-loading');
        if (loading) loading.style.display = e.data.loading ? 'flex' : 'none';
      }
      if (e.data?.type === 'moogpt:suggestQuestion') {
        document.getElementById('suggest-panel-loading').style.display = 'none';
        const msgs = document.getElementById('suggest-panel-messages');
        if (!msgs) return;
        const bubble = document.createElement('div');
        bubble.className = 'suggest-smsg-ki';
        bubble.textContent = e.data.question;
        msgs.appendChild(bubble);
        msgs.scrollTop = msgs.scrollHeight;
        document.getElementById('suggest-panel-input-row').style.display = 'flex';
        const input = document.getElementById('suggest-panel-input');
        if (input) { input.value = ''; input.focus(); }
      }
      if (e.data?.type === 'moogpt:suggestFinal') {
        document.getElementById('suggest-panel-loading').style.display = 'none';
        document.getElementById('suggest-panel-input-row').style.display = 'none';
        const msgs = document.getElementById('suggest-panel-messages');
        if (msgs) {
          const done = document.createElement('div');
          done.className = 'suggest-smsg-ki';
          done.textContent = 'Fertiger Prompt wurde erstellt. ✓';
          msgs.appendChild(done);
          msgs.scrollTop = msgs.scrollHeight;
        }
        const previewText = document.getElementById('suggest-panel-preview-text');
        if (previewText) previewText.textContent = e.data.prompt;
        document.getElementById('suggest-panel-preview').style.display = 'flex';
      }
      if (e.data?.type === 'moogpt:suggestClose') {
        const panel = document.getElementById('suggest-panel');
        if (panel) panel.style.display = 'none';
      }
      if (e.data?.type === 'moogpt:suggestError') {
        document.getElementById('suggest-panel-loading').style.display = 'none';
        const msgs = document.getElementById('suggest-panel-messages');
        if (msgs) {
          const errEl = document.createElement('div');
          errEl.className = 'suggest-smsg-ki';
          errEl.style.color = '#c00';
          errEl.textContent = `Fehler: ${e.data.message}`;
          msgs.appendChild(errEl);
          msgs.scrollTop = msgs.scrollHeight;
        }
        document.getElementById('suggest-panel-input-row').style.display = 'flex';
      }
    });

    // Issue #15: Lightbox initialisieren
    this._initLightbox();
  }

  /** Issue #5: Öffnet das Lehrer-Dashboard (mit Token-Auth). */
  openDashboard() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';

    if (this.dashboardToken) {
      // Token schon vorhanden → sofort öffnen (User-Gesture-Kontext ✓)
      this._openDashboardTab(this.dashboardToken, activityId);
    } else {
      // Token noch nicht da: Fenster SOFORT öffnen (Browser erlaubt window.open nur
      // direkt aus User-Gesture), danach nach Token-Empfang dorthin navigieren.
      this.pendingDashboardWindow = window.open('about:blank', '_blank');
      this.pendingDashboardOpen   = true;
      if (!this.wsInitialized) {
        this.setupWebSocket();
        this.wsInitialized = true;
      }
    }
  }

  /**
   * Ruft den vollständigen Namen ab: zuerst über Moodles AJAX-Endpoint,
   * als Fallback über die Profilseite (Titel-Parsing).
   */
  async _fetchMoodleUserName(userId, wwwroot, sesskey) {
    // Versuch 1: AJAX-Endpoint (gibt sauberes fullname zurück)
    try {
      const body = JSON.stringify([{
        index: 0,
        methodname: 'core_user_get_users_by_field',
        args: { field: 'id', values: [String(userId)] }
      }]);
      const resp = await fetch(
        `${wwwroot}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=core_user_get_users_by_field`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body }
      );
      if (resp.ok) {
        const data = await resp.json();
        const fullname = data?.[0]?.data?.[0]?.fullname;
        if (fullname) { console.log(`[Bot] Name via AJAX: ${fullname}`); return fullname; }
      }
    } catch (e) { /* weiter mit Fallback */ }

    // Versuch 2: Profilseite – Titel hat die Form "Name: Öffentliches Profil | Site"
    // oder "Name | Profil | Site" → wir nehmen nur den Teil vor dem ersten " | " oder ": "
    try {
      const resp = await fetch(`${wwwroot}/user/profile.php?id=${userId}`, { credentials: 'include' });
      if (resp.ok) {
        const text  = await resp.text();
        const match = text.match(/<title>\s*([^|<\n]+)/);
        if (match) {
          // ": Öffentliches Profil" und Varianten abschneiden
          const name = match[1].replace(/:\s*(Öffentliches Profil|Profil|Profile).*/i, '').trim();
          if (name) { console.log(`[Bot] Name via Profilseite: ${name}`); return name; }
        }
      }
    } catch (e) { console.warn('[Bot] Profilseiten-Abruf fehlgeschlagen:', e); }

    return null;
  }

  /** Öffnet den Dashboard-Tab mit Token (oder navigiert ein pending-Fenster). */
  _openDashboardTab(token, activityId) {
    const url = `${this._baseUrl()}/dashboard.html?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;
    if (this.pendingDashboardWindow && !this.pendingDashboardWindow.closed) {
      this.pendingDashboardWindow.location.href = url;
      this.pendingDashboardWindow = null;
    } else {
      window.open(url, '_blank');
    }
  }

  // ── P5: Config-Overlay ────────────────────────────────────────────────────

  openConfig() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    if (this.dashboardToken) {
      this._openConfigOverlay(this.dashboardToken, activityId);
    } else {
      this._pendingConfigOpen = true;
      if (!this.wsInitialized) {
        this.setupWebSocket();
        this.wsInitialized = true;
      }
    }
  }

  closeConfig() {
    const overlay = document.getElementById('config-overlay');
    if (overlay) overlay.style.display = 'none';
    const suggestPanel = document.getElementById('suggest-panel');
    if (suggestPanel) suggestPanel.style.display = 'none';
  }

  // ── Issue #43: Lock-Modal ─────────────────────────────────────────────────

  openLockModal() {
    const modal = document.getElementById('lock-modal');
    if (!modal) return;
    const input = document.getElementById('lock-duration');
    if (input) input.value = '';
    modal.style.display = 'flex';
    if (input) setTimeout(() => input.focus(), 50);
  }

  closeLockModal() {
    const modal = document.getElementById('lock-modal');
    if (modal) modal.style.display = 'none';
  }

  async _submitLock() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    const token = this.dashboardToken;
    if (!activityId || !token) {
      console.warn('[Lock] activityId oder Token fehlt');
      this.closeLockModal();
      return;
    }
    const durationRaw = document.getElementById('lock-duration')?.value;
    const durationMinutes = durationRaw ? Number(durationRaw) : 0;
    const url = `${this._baseUrl()}/api/activity/${encodeURIComponent(activityId)}/lock?token=${encodeURIComponent(token)}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes }),
      });
      if (resp.ok) {
        this._setLockState(true);
      } else {
        console.error('[Lock] Fehler:', resp.status);
      }
    } catch (err) {
      console.error('[Lock] Netzwerkfehler:', err);
    }
    this.closeLockModal();
  }

  _setLockState(locked) {
    this._locked = locked;
    const btn = document.getElementById('stop-icon');
    if (!btn) return;
    if (locked) {
      btn.style.backgroundColor = '#27ae60';
      btn.title = 'Plenumsphase beenden (Chat entsperren)';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
      </svg>`;
    } else {
      btn.style.backgroundColor = '';
      btn.title = 'Plenumsphase starten (Chat sperren)';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24">
        <rect x="4" y="4" width="16" height="16" rx="3"/>
      </svg>`;
    }
  }

  async _submitUnlock() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    const token = this.dashboardToken;
    if (!activityId || !token) return;
    const url = `${this._baseUrl()}/api/activity/${encodeURIComponent(activityId)}/lock?token=${encodeURIComponent(token)}`;
    try {
      const resp = await fetch(url, { method: 'DELETE' });
      if (resp.ok) this._setLockState(false);
    } catch (err) {
      console.error('[Lock] Entsperren fehlgeschlagen:', err);
    }
  }

  _baseUrl() {
    return `${this.settings.protocol}://${this.settings.host}:${this.settings.port}`;
  }

  _iconUrl(name) {
    return `${this._baseUrl()}/${name || 'grw'}.png`;
  }

  // ── P5a: Config vom Server anwenden ──────────────────────────────────────

  _applyConfig(config) {
    const { title, botIcon, opener, uploadMode, needsConfig } = config;

    this.settings.title      = title      ?? null;
    this.settings.botIcon    = botIcon    ?? 'grw';
    this.settings.opener     = opener     ?? null;
    this.settings.uploadMode = uploadMode ?? 'off';

    const iconUrl = this._iconUrl(botIcon || 'grw');
    document.querySelectorAll('#chat-icon img, .chat-header-icon').forEach(img => { img.src = iconUrl; });

    const h1 = document.querySelector('#chat-container .chat-header h1');
    if (h1 && title) h1.textContent = title;

    const chatWindow = document.getElementById('chat-window');
    if (chatWindow && chatWindow.children.length === 0) {
      const openerText = opener || 'Hallo, wie kann ich dir helfen?';
      const div = document.createElement('div');
      div.className = 'message received';
      div.innerHTML = `<p>${openerText}</p>`;
      chatWindow.appendChild(div);
    }

    const mode = uploadMode || 'off';
    const inputContainer = document.querySelector('.input-container');
    if (inputContainer && mode !== 'off') {
      inputContainer.innerHTML = this._buildInputHTML(mode);
      inputContainer.querySelector('#upload-button')?.addEventListener('click', () => {
        inputContainer.querySelector('#file-input')?.click();
      });
      inputContainer.querySelector('#file-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileUpload(file);
        e.target.value = '';
      });
      const chatContainer = document.getElementById('chat-container');
      if (chatContainer && !this._dragListenerAdded) {
        chatContainer.addEventListener('dragover', (e) => { e.preventDefault(); chatContainer.classList.add('drag-over'); });
        chatContainer.addEventListener('dragleave', () => chatContainer.classList.remove('drag-over'));
        chatContainer.addEventListener('drop', (e) => {
          e.preventDefault();
          chatContainer.classList.remove('drag-over');
          const file = e.dataTransfer.files[0];
          if (file) this.handleFileUpload(file);
        });
        this._dragListenerAdded = true;
      }
      if (!this._pasteListenerAdded) {
        document.addEventListener('paste', (e) => {
          if (document.getElementById('chat-container')?.style.display === 'flex') {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) { this.handleFileUpload(file); e.preventDefault(); break; }
              }
            }
          }
        });
        this._pasteListenerAdded = true;
      }
    }

    const cfgBtn = document.getElementById('config-icon');
    if (cfgBtn) {
      const existing = cfgBtn.querySelector('.cfg-badge');
      if (needsConfig && this.settings.isTeacher) {
        if (!existing) {
          const badge = document.createElement('span');
          badge.className = 'cfg-badge';
          cfgBtn.appendChild(badge);
        }
      } else {
        existing?.remove();
      }
    }

    console.log(`[Bot] Config angewendet: title="${title}", uploadMode=${uploadMode}, needsConfig=${needsConfig}`);
  }

  _openConfigOverlay(token, activityId) {
    const url = `${this._baseUrl()}/config.html?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;
    const iframe  = document.getElementById('config-overlay-iframe');
    const overlay = document.getElementById('config-overlay');
    if (!iframe || !overlay) return;
    const srcChanged = iframe.src !== url;
    if (srcChanged) iframe.src = url;
    overlay.style.display = 'flex';
    this._sendTaskContextToConfig(iframe, srcChanged);
  }

  _sendTaskContextToConfig(iframe, srcChanged) {
    const task = document.querySelector('.activity-description')?.innerHTML?.trim() || null;

    const sendPayload = (images) => {
      iframe.contentWindow.postMessage({ type: 'moogpt:taskContext', task, images }, '*');
    };

    const buildAndSend = async () => {
      const images = [];
      if (task) {
        const re = /<img[^>]+src=["']([^"']+)["']/gi;
        let m;
        const srcs = [];
        while ((m = re.exec(task)) !== null) srcs.push(m[1]);
        for (const src of srcs) {
          try {
            const response = await fetch(src);
            if (!response.ok) { images.push(null); continue; }
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload  = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            images.push(base64);
          } catch {
            images.push(null);
          }
        }
      }
      sendPayload(images);
    };

    if (srcChanged) {
      // Iframe is (re)loading — wait for it to finish before posting
      iframe.addEventListener('load', function onLoad() {
        iframe.removeEventListener('load', onLoad);
        buildAndSend();
      });
    } else {
      // Iframe already at the right URL — post immediately
      buildAndSend();
    }
  }

  loadExternalLibraries() {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.defer = true;
        script.onload = () => resolve(src);
        script.onerror = () =>
          reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const loadCss = (href) => {
      return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.href = href;
        link.rel = "stylesheet";
        link.onload = () => resolve(href);
        link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
        document.head.appendChild(link);
      });
    };

    return Promise.all([
      loadCss("https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.css"),
      loadCss(
        "https://cdnjs.cloudflare.com/ajax/libs/prism/1.23.0/themes/prism.min.css"
      ),
    ]);
  }

  async extractImagesFromTask() {
    const images = [];
    let failedCount = 0;
    if (!this.settings.task) return { images, failedCount };
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.settings.task, "text/html");
      const imgTags = doc.querySelectorAll("img");
      for (const img of imgTags) {
        try {
          const response = await fetch(img.src);
          if (!response.ok) {
            console.warn("Could not fetch image (HTTP " + response.status + "):", img.src);
            failedCount++;
            continue;
          }
          const blob = await response.blob();
          const pngBlob = await this._blobToPng(blob);
          const base64 = await this._blobToDataURL(pngBlob);
          images.push(base64);
          console.log("Image extracted:", img.src);
        } catch (err) {
          console.warn("Could not process image:", img.src, err);
          failedCount++;
        }
      }
    } catch (err) {
      console.warn("Error extracting images:", err);
    }
    return { images, failedCount };
  }

  setupWebSocket() {
    const host = this.settings.host || "localhost";
    const port =
      this.settings.port ||
      (window.location.protocol === "https:" ? "443" : "80");
    const protocol = this.settings.protocol === "https" ? "wss" : "ws";
    const wsUrl = `${protocol}://${host}:${port}/api/chat`;
    console.log("wsUrl: ", wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = async () => {
      console.log("WebSocket connection established");

      // Input-Container wiederherstellen (nach Reconnect)
      this.restoreInputContainer();

      // Moodle-User-Kontext auslesen (Issue #3: Thread-Persistenz)
      const userId = window.M?.cfg?.userId?.toString() || null;
      // DOM-Selektoren (leerer String zählt als falsy und wird übersprungen)
      let userName = window.M?.cfg?.fullname
        || document.querySelector('img.userpicture')?.getAttribute('alt')?.trim()
        || document.querySelector('.usermenu .usertext')?.textContent?.trim()
        || document.querySelector('span.usertext')?.textContent?.trim()
        || document.querySelector('[data-key="myprofile"] .menu-action-text')?.textContent?.trim()
        || null;
      // Zuverlässiger Fallback: Moodles internes AJAX-Endpoint (same-origin, sesskey-Auth)
      if (!userName && userId && window.M?.cfg?.wwwroot && window.M?.cfg?.sesskey) {
        userName = await this._fetchMoodleUserName(userId, window.M.cfg.wwwroot, window.M.cfg.sesskey);
      }
      const activityId = new URLSearchParams(window.location.search).get('id') || null;
      // Aufgabentitel aus Moodle-DOM (Issue #5: in DB speichern, nicht per URL-Param)
      const activityName =
        document.querySelector('.page-header-headings h1')?.textContent?.trim()
        || document.querySelector('#region-main h1')?.textContent?.trim()
        || document.querySelector('.activity-title')?.textContent?.trim()
        || document.querySelector('h1.h2')?.textContent?.trim()
        || document.title?.split('|')[0]?.trim()
        || null;
      // P5a: task aus Moodle-DOM lesen (nicht mehr aus Constructor)
      const task = document.querySelector('.activity-description')?.innerHTML?.trim() || null;

      if (userId)        this.settings.userId       = userId;
      if (userName)      this.settings.userName     = userName;
      if (activityId)    this.settings.activityId   = activityId;
      if (activityName)  this.settings.activityName = activityName;
      if (task)          this.settings.task         = task;
      console.log(`[Bot] userId=${userId}, userName=${userName}, activityId=${activityId}, activityName=${activityName}`);

      // Rollenerkennung (Issue #4):
      // form[action*="editmode.php"] ist auf allen Moodle-Seiten für Trainer sichtbar, für Schüler nicht.
      // userswitchedrole als Fallback wenn Trainer "Als Teilnehmer ansehen" aktiv hat.
      const hasEditMode = document.querySelector('form[action*="editmode.php"]') !== null;
      const isSwitchedRole = document.body.className.includes('userswitchedrole');
      const isTeacher = hasEditMode && !isSwitchedRole;
      this.settings.isTeacher = isTeacher;
      console.log(`[Bot] isTeacher=${isTeacher} (editmode=${hasEditMode}, switched=${isSwitchedRole})`);

      // Bilder aus der Aufgabenstellung extrahieren und als Base64 mitsenden
      const { images, failedCount } = await this.extractImagesFromTask();
      if (images.length > 0) {
        this.settings.images = images;
        console.log(`${images.length} Bild(er) aus Aufgabenstellung extrahiert`);
      }
      if (failedCount > 0) {
        this._showChatError(
          `⚠️ ${failedCount} Bild(er) aus der Aufgabenstellung konnten nicht verarbeitet werden ` +
          `(Format nicht unterstützt – vermutlich TIFF). ` +
          `Bitte das Bild in GeoGebra oder einem Bildprogramm als PNG exportieren, ` +
          `dann direkt als Datei in Moodle einfügen (nicht via Zwischenablage).`
        );
      }

      const obj = { type: "settings", data: this.settings };

      try {
        this.ws.send(JSON.stringify(obj));
        console.log("Settings sent successfully!");
      } catch (error) {
        console.error("Send error:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.showConnectionLostMessage();
    };

    this.ws.onclose = () => {
      console.warn("WebSocket connection closed");
      this.wsInitialized = false;  // Issue #3: Reconnect beim nächsten Chat-Öffnen
      this.showConnectionLostMessage();
    };

    this.ws.onmessage = (event) => {
      const chatWindow = document.getElementById("chat-window");
      const chatInput = document.getElementById("chat-input");

      try {
        const messageObj = JSON.parse(event.data);

        // Chatverlauf beim Reconnect anzeigen (Issue #3)
        if (messageObj.type === "history") {
          this.renderHistory(messageObj.messages);
          return;
        }

        // P5a: Aktivitäts-Config vom Server empfangen
        if (messageObj.type === "config") {
          this._applyConfig(messageObj.config);
          return;
        }

        // Issue #5: Dashboard-Token vom Server empfangen
        if (messageObj.type === "dashboardToken") {
          this.dashboardToken = messageObj.token;
          console.log(`[Bot] Dashboard-Token empfangen für activityId=${messageObj.activityId}`);
          if (this.pendingDashboardOpen) {
            this.pendingDashboardOpen = false;
            this._openDashboardTab(messageObj.token, messageObj.activityId);
          }
          if (this._pendingConfigOpen) {
            this._pendingConfigOpen = false;
            this._openConfigOverlay(messageObj.token, messageObj.activityId);
          }
          return;
        }

        // P3: Plenum-Sperre
        if (messageObj.type === "locked") {
          if (this.settings.isTeacher) {
            this._setLockState(true);
          } else {
            this._showLockOverlay();
          }
          return;
        }
        if (messageObj.type === "unlocked") {
          if (this.settings.isTeacher) {
            this._setLockState(false);
          } else {
            this._hideLockOverlay();
          }
          return;
        }

        let messageText = messageObj.messages;

        // Ersetzen von \[ durch $$
        messageText = messageText.replace(/\\\[/g, "$$");
        // Ersetzen von \] durch $$
        messageText = messageText.replace(/\\\]/g, "$$");
        // Ersetzen von \( durch $
        messageText = messageText.replace(/\\\(/g, "$");
        // Ersetzen von \) durch $
        messageText = messageText.replace(/\\\)/g, "$");

        // Sicherstellen, dass marked geladen ist
        // Markdown in HTML umwandeln
        const htmlContent = this.marked.parse(messageText);

        if (this.msgCount === 0) {
          const loading = document.getElementById("loading");
          if (loading) {
            chatWindow.removeChild(loading);
          }

          const message = document.createElement("div");
          message.className = "message received";
          message.innerHTML = `${htmlContent}`;
          chatWindow.appendChild(message);

          var mathDiv = message;
          renderMathInElement(mathDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        } else {
          const lastReceivedMessage = chatWindow.querySelector(
            ".message.received:last-child"
          );
          lastReceivedMessage.innerHTML = `${htmlContent}`;

          var mathDiv = lastReceivedMessage;
          renderMathInElement(mathDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
          });
        }
        this.msgCount += 1;

        // Syntax-Highlighting anwenden
        Prism.highlightAll();

        if (messageObj.end === true) {
          // Zeitstempel zur fertigen Antwort hinzufügen
          const nowStr = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
          const lastMsg = chatWindow.querySelector(".message.received:last-child");
          if (lastMsg && !lastMsg.querySelector(".msg-time")) {
            const timeSpan = document.createElement("span");
            timeSpan.className = "msg-time";
            timeSpan.textContent = nowStr;
            lastMsg.appendChild(timeSpan);
          }
          // Feedback-Buttons nur für Schüler
          if (!this.settings.isTeacher && lastMsg && !lastMsg.querySelector('.mmb-feedback')) {
            this._addFeedbackButtons(lastMsg);
          }
          this._enableInput();
        }
        chatWindow.scrollTop = chatWindow.scrollHeight;
      } catch (error) {
        console.log("Error parsing JSON message:", error);
      }
    };
  }

  sendMessage() {
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const messageText = chatInput.value;
    const sendButton = document.getElementById("send-button");

    if (messageText.trim() !== "") {
      const nowStr = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
      const message = document.createElement("div");
      message.className = "message sent";
      message.innerHTML = `<p>${messageText}</p><span class="msg-time">${nowStr}</span>`;
      chatWindow.appendChild(message);
      chatInput.value = "";
      this.ws.send(
        JSON.stringify({ type: "chatmsg", data: { message: messageText } })
      );

      const loading = document.createElement("div");
      loading.className = "message_loading";
      loading.id = "loading";
      loading.innerHTML = `<img src="${this._baseUrl()}/loading.gif" alt="Loading...">`;
      chatWindow.appendChild(loading);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      this.msgCount = 0;

      this._disableInput();
    }
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      this.sendMessage();
    }
  }

  toggleChat() {
    const chatContainer = document.getElementById("chat-container");
    const chatIcon = document.getElementById("chat-icon");

    if (
      chatContainer.style.display === "none" ||
      chatContainer.style.display === ""
    ) {
      // P5a: WS wurde durch init() gestartet; hier nur Reconnect bei Drop
      if (!this.wsInitialized) {
        this.setupWebSocket();
        this.wsInitialized = true;
      }
      chatContainer.style.display = "flex";
      chatIcon.style.display = "none";
    } else {
      chatContainer.style.display = "none";
      chatIcon.style.display = "block";
    }
  }

  /**
   * Rendert den Chatverlauf aus der Datenbank (Issue #3).
   * Ersetzt die Opener-Nachricht durch den tatsächlichen Verlauf mit Zeitstempeln.
   */
  renderHistory(messages) {
    if (!messages || messages.length === 0) return;
    const chatWindow = document.getElementById("chat-window");
    chatWindow.innerHTML = '';

    // Opener-Nachricht wiederherstellen
    const opener = this.settings.opener || "Hallo, wie kann ich dir helfen?";
    const openerDiv = document.createElement("div");
    openerDiv.className = "message received";
    openerDiv.innerHTML = `<p>${opener}</p>`;
    chatWindow.appendChild(openerDiv);

    // Nachrichten in Sessions aufteilen (Pause > 30 Min = neue Session)
    const sessions = this._splitHistorySessions(messages);

    for (const sess of sessions) {
      const firstDate = new Date(sess[0].created_at.replace(' ', 'T') + 'Z');
      const dayStr = firstDate.toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit'
      });
      const sep = document.createElement("div");
      sep.className = "history-separator";
      sep.textContent = `Gespräch vom ${dayStr}`;
      chatWindow.appendChild(sep);

      for (const msg of sess) {
        const time = new Date(msg.created_at.replace(' ', 'T') + 'Z')
          .toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

        const div = document.createElement("div");
        if (msg.role === 'user') {
          div.className = "message sent";
          div.innerHTML = this._renderUserContent(msg.content, msg.content_type) + `<span class="msg-time">${time}</span>`;
        } else {
          div.className = "message received";
          const htmlContent = this.marked.parse(msg.content);
          div.innerHTML = `${htmlContent}<span class="msg-time">${time}</span>`;
          if (!this.settings.isTeacher) this._addFeedbackButtons(div);
        }
        chatWindow.appendChild(div);
      }
    }

    // Mathe-Rendering für History
    renderMathInElement(chatWindow, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
    });

    chatWindow.scrollTop = chatWindow.scrollHeight;
    // Bug #15: KaTeX-CSS lädt async → Höhen nach Cache-Clear zunächst falsch.
    // Verzögerter Scroll als Fallback (nach CSS-Anwendung).
    setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 300);
  }

  /** Teilt Nachrichten in Sessions auf (Pause > 30 Min = neue Session). */
  _splitHistorySessions(messages, gapMs = 30 * 60 * 1000) {
    const sessions = [];
    let current = [];
    for (const msg of messages) {
      if (current.length > 0) {
        const prev = new Date(current[current.length - 1].created_at.replace(' ', 'T') + 'Z');
        const curr = new Date(msg.created_at.replace(' ', 'T') + 'Z');
        if (curr - prev > gapMs) { sessions.push(current); current = []; }
      }
      current.push(msg);
    }
    if (current.length > 0) sessions.push(current);
    return sessions;
  }

  /** Stellt den Eingabe-Bereich nach einem Reconnect wieder her. */
  restoreInputContainer() {
    const inputContainer = document.querySelector(".input-container");
    if (inputContainer && !document.getElementById("chat-input")) {
      const uploadMode = this.settings.uploadMode || 'off';
      inputContainer.innerHTML = this._buildInputHTML(uploadMode);
      if (uploadMode !== 'off') {
        const fileInput = inputContainer.querySelector('#file-input');
        fileInput?.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) this.handleFileUpload(file);
          e.target.value = '';
        });
      }
    }
  }

  /** Erzeugt das HTML für den Input-Bereich (mit oder ohne Upload-Button). */
  _buildInputHTML(uploadMode) {
    if (uploadMode === 'off') {
      return `<input type="text" id="chat-input" placeholder="Geben Sie eine Nachricht ein..." onkeydown="handleKeyDown(event)">
        <button id="send-button" onclick="sendMessage()">Senden</button>`;
    }
    const accept = uploadMode === 'files' ? 'image/*,application/pdf' : 'image/*';
    return `<input type="file" id="file-input" accept="${accept}" style="display:none">
      <button id="upload-button" title="Bild${uploadMode === 'files' ? ' oder PDF' : ''} hochladen">📎</button>
      <input type="text" id="chat-input" placeholder="Geben Sie eine Nachricht ein..." onkeydown="handleKeyDown(event)">
      <button id="send-button" onclick="sendMessage()">Senden</button>`;
  }

  // ── Issue #10: Dateiupload ────────────────────────────────────────────────

  /** Einstiegspunkt für alle Upload-Wege (Button, Paste, Drag&Drop). */
  async handleFileUpload(file) {
    // Video ablehnen
    if (file.type.startsWith('video/')) {
      this._showChatError('⚠️ Videos werden nicht unterstützt.');
      return;
    }
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const uploadMode = this.settings.uploadMode || 'off';
    if (!isPdf && !isImage) {
      this._showChatError('⚠️ Nur Bilder und PDFs sind erlaubt.');
      return;
    }
    if (isPdf && uploadMode !== 'files') {
      this._showChatError('⚠️ PDF-Upload ist für diese Aufgabe nicht aktiviert.');
      return;
    }
    if (!this.wsInitialized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._showChatError('⚠️ Noch nicht verbunden. Chat kurz öffnen und erneut versuchen.');
      return;
    }

    this._disableInput();

    try {
      let jpegBlob;
      if (isPdf) {
        jpegBlob = await this._pdfToJpeg(file);
        if (!jpegBlob) return; // Fehler wurde bereits im Chat angezeigt
      } else {
        jpegBlob = await this._compressImage(file);
      }

      const base64 = await this._blobToDataURL(jpegBlob);
      const originalType = isPdf ? 'pdf' : 'image';

      // Vorschau im Chat anzeigen
      this._appendUploadPreview(base64, originalType);

      // Loading anzeigen
      const chatWindow = document.getElementById("chat-window");
      const loading = document.createElement("div");
      loading.className = "message_loading";
      loading.id = "loading";
      loading.innerHTML = `<img src="${this._baseUrl()}/loading.gif" alt="Loading...">`;
      chatWindow.appendChild(loading);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      this.msgCount = 0;

      document.getElementById("send-button").disabled = true;

      this.ws.send(JSON.stringify({ type: "filemsg", data: { file: base64, originalType } }));
    } catch (err) {
      console.error('[Upload] Fehler:', err);
      this._showChatError('⚠️ Fehler beim Verarbeiten der Datei: ' + err.message);
      this._enableInput();
    }
  }

  /** PDF: Seite 1 via PDF.js auf Canvas rendern → JPEG Blob. */
  async _pdfToJpeg(file) {
    let pdfjsLib;
    try {
      pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.mjs';
    } catch (e) {
      this._showChatError('⚠️ PDF-Bibliothek konnte nicht geladen werden.');
      this._enableInput();
      return null;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    if (pdf.numPages > 1) {
      this._showChatError(`⚠️ Das PDF hat ${pdf.numPages} Seiten. Nur einseitige PDFs sind erlaubt.`);
      this._enableInput();
      return null;
    }
    const page = await pdf.getPage(1);
    const MAX_PX = 1920;
    let vp = page.getViewport({ scale: 1.0 });
    const scale = Math.min(MAX_PX / vp.width, MAX_PX / vp.height, 1.0);
    vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  }

  /** Bild auf max. 1920px skalieren und als JPEG 85% komprimieren. */
  _compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_PX = 1920;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX_PX || h > MAX_PX) {
          if (w >= h) { h = Math.round(h * MAX_PX / w); w = MAX_PX; }
          else        { w = Math.round(w * MAX_PX / h); h = MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Blob → PNG-Blob via Canvas (lossless; wirft bei nicht renderbaren Formaten wie TIFF). */
  _blobToPng(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_PX = 2048;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX_PX || h > MAX_PX) {
          if (w >= h) { h = Math.round(h * MAX_PX / w); w = MAX_PX; }
          else        { w = Math.round(w * MAX_PX / h); h = MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          pngBlob => pngBlob ? resolve(pngBlob) : reject(new Error('Canvas PNG export failed')),
          'image/png'
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });
  }

  /** Blob → base64 data-URL. */
  _blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Zeigt eine Vorschau der hochgeladenen Datei als gesendete Nachricht. */
  _appendUploadPreview(base64, originalType) {
    const chatWindow = document.getElementById("chat-window");
    const nowStr = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement("div");
    div.className = "message sent";
    const label = originalType === 'pdf' ? '<p style="margin:2px 0 0;font-size:11px;opacity:0.7">📄 PDF-Seite</p>' : '';
    div.innerHTML = `<img src="${base64}" style="max-width:220px;border-radius:6px;display:block;margin-bottom:4px;" class="mmb-lb-trigger" onclick="window._mmbLightbox&&window._mmbLightbox(this.src)">${label}<span class="msg-time">${nowStr}</span>`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /** Rendert den Inhalt einer Nutzernachricht (Text, Bild, PDF) als HTML-String. */
  _renderUserContent(content, contentType) {
    if (contentType === 'image' || contentType === 'pdf') {
      if (content && content.startsWith('data:')) {
        const label = contentType === 'pdf' ? '<p style="margin:2px 0 0;font-size:11px;opacity:0.7">📄 PDF-Seite</p>' : '';
        return `<img src="${content}" style="max-width:220px;border-radius:6px;display:block;margin-bottom:4px;" class="mmb-lb-trigger" onclick="window._mmbLightbox&&window._mmbLightbox(this.src)">${label}`;
      }
      return contentType === 'pdf'
        ? `<p>📄 <em>PDF-Upload (1 Seite)</em></p>`
        : `<p>📷 <em>Bild (extern gespeichert)</em></p>`;
    }
    return `<p>${content}</p>`;
  }

  /** Zeigt Fehlermeldung als System-Nachricht im Chat. */
  _showChatError(msg) {
    const chatWindow = document.getElementById("chat-window");
    if (!chatWindow) return;
    const div = document.createElement("div");
    div.className = "message received";
    div.style.color = '#c00';
    div.innerHTML = `<p>${msg}</p>`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  _disableInput() {
    const inp = document.getElementById("chat-input");
    const btn = document.getElementById("send-button");
    const upBtn = document.getElementById("upload-button");
    if (inp)  inp.disabled = true;
    if (btn)  btn.disabled = true;
    if (upBtn) upBtn.disabled = true;
  }

  _enableInput() {
    const inp = document.getElementById("chat-input");
    const btn = document.getElementById("send-button");
    const upBtn = document.getElementById("upload-button");
    if (inp)  { inp.disabled = false; inp.focus(); }
    if (btn)  btn.disabled = false;
    if (upBtn) upBtn.disabled = false;
  }

  showConnectionLostMessage() {
    const inputContainer = document.querySelector(".input-container");
    inputContainer.innerHTML =
      '<div class="connection-lost">Verbindung unterbrochen – Chat schließen und neu öffnen zum Wiederverbinden.</div>';
  }

  // ── Issue #15: Lightbox ───────────────────────────────────────────────────

  _initLightbox() {
    if (document.getElementById('mmb-lightbox')) return;
    const lb = document.createElement('div');
    lb.id = 'mmb-lightbox';
    lb.innerHTML = `
      <button id="mmb-lb-close" aria-label="Schließen">✕</button>
      <div id="mmb-lb-inner">
        <div id="mmb-lb-canvas"><img id="mmb-lb-img" src="" alt="Vorschau"></div>
      </div>`;
    document.body.appendChild(lb);

    const inner = lb.querySelector('#mmb-lb-inner');
    const img   = lb.querySelector('#mmb-lb-img');
    this._lbInner = inner;
    this._lbImg   = img;

    // Schließen
    lb.addEventListener('click', (e) => { if (e.target === lb) this._closeLightbox(); });
    lb.querySelector('#mmb-lb-close').addEventListener('click', () => this._closeLightbox());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeLightbox(); });

    // Maus-Zoom: cursor-zentriert, mit erzwungenem Reflow vor scrollLeft
    inner.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.05 : (1 / 1.05);
      const innerRect = inner.getBoundingClientRect();

      // Cursor-Position im Scroll-Raum (vor Resize lesen)
      const cursorX = inner.scrollLeft + (e.clientX - innerRect.left);
      const cursorY = inner.scrollTop  + (e.clientY - innerRect.top);

      // Aktuelle Bildposition im Canvas (margin:auto horizontal, marginTop vertikal)
      const curW = img.offsetWidth, curH = img.offsetHeight;
      const imgX = Math.max(0, (inner.clientWidth  - curW) / 2);
      const imgY = parseFloat(img.style.marginTop || '0');

      // Relativer Treffer im Bild (0..1)
      const rx = (cursorX - imgX) / curW;
      const ry = (cursorY - imgY) / curH;

      const natW = img.naturalWidth  || inner.clientWidth;
      const natH = img.naturalHeight || inner.clientHeight;
      const newW = Math.min(Math.max(curW * factor, 100), natW * 6);
      const newH = newW / natW * natH;

      img.style.width = newW + 'px';
      void inner.scrollWidth; // ← synchroner Reflow: Canvas hat neue Größe bevor scrollLeft gesetzt wird

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
      img.classList.add('mmb-dragging');
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
      img.classList.remove('mmb-dragging');
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

    window._mmbLightbox = (src) => this._openLightbox(src);
  }

  _openLightbox(src) {
    const lb    = document.getElementById('mmb-lightbox');
    const inner = this._lbInner || document.getElementById('mmb-lb-inner');
    const img   = this._lbImg   || document.getElementById('mmb-lb-img');
    if (!lb || !img || !inner) return;
    img.style.width = '';
    img.src = src;
    inner.scrollLeft = 0;
    inner.scrollTop  = 0;
    lb.style.display = 'flex';

    // Initiales Fit: Bild auf max 90vw × 90vh skalieren + vertikal zentrieren
    const fitImg = () => {
      const natW = img.naturalWidth, natH = img.naturalHeight;
      if (!natW || !natH) return;
      const maxW = inner.clientWidth, maxH = inner.clientHeight;
      const scale = Math.min(1, maxW / natW, maxH / natH);
      if (scale < 1) img.style.width = Math.round(natW * scale) + 'px';
      // Vertikale Zentrierung per marginTop (CSS-Flex entfernt → explizit setzen)
      const dispH = img.offsetHeight || Math.round(natH * scale);
      img.style.marginTop = Math.max(0, (inner.clientHeight - dispH) / 2) + 'px';
    };
    if (img.complete && img.naturalWidth) { fitImg(); }
    else { img.onload = fitImg; }
  }

  _closeLightbox() {
    const lb = document.getElementById('mmb-lightbox');
    if (lb) lb.style.display = 'none';
  }

  // ── Issue #46: Schüler-Feedback-Buttons ──────────────────────────────────

  /**
   * Hängt 👍/👎-Buttons an eine Assistenten-Nachricht.
   * Klick öffnet ein Inline-Panel mit Freitext + Speichern.
   */
  _addFeedbackButtons(msgEl) {
    const bar = document.createElement('div');
    bar.className = 'mmb-feedback';

    const thumbUp   = document.createElement('button');
    thumbUp.className = 'mmb-fb-btn';
    thumbUp.title   = 'Hilfreich';
    thumbUp.textContent = '👍';

    const thumbDown = document.createElement('button');
    thumbDown.className = 'mmb-fb-btn';
    thumbDown.title   = 'Nicht hilfreich / Wunsch eingeben';
    thumbDown.textContent = '👎';

    bar.appendChild(thumbUp);
    bar.appendChild(thumbDown);
    msgEl.appendChild(bar);

    const openPanel = (prefill) => {
      // Bestehende Panels in dieser Nachricht entfernen
      msgEl.querySelectorAll('.mmb-fb-panel').forEach(p => p.remove());

      const panel = document.createElement('div');
      panel.className = 'mmb-fb-panel';
      panel.innerHTML = `
        <input class="mmb-fb-input" type="text" placeholder="Was wünschst du dir? (optional)" value="${prefill || ''}">
        <div class="mmb-fb-actions">
          <button class="mmb-fb-save">Speichern</button>
          <button class="mmb-fb-cancel">Abbrechen</button>
        </div>`;
      msgEl.appendChild(panel);

      const doSave = () => {
        const text = panel.querySelector('.mmb-fb-input').value.trim();
        if (text) {
          this._saveFeedback(text);
          panel.remove();
          bar.querySelector('.mmb-fb-saved')?.remove();
          const saved = document.createElement('span');
          saved.className = 'mmb-fb-saved';
          saved.textContent = '✓ gespeichert';
          bar.appendChild(saved);
        } else {
          panel.remove();
        }
      };
      panel.querySelector('.mmb-fb-cancel').onclick = () => panel.remove();
      panel.querySelector('.mmb-fb-save').onclick   = doSave;
      panel.querySelector('.mmb-fb-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
      });
      panel.querySelector('.mmb-fb-input').focus();
    };

    thumbUp.onclick = () => {
      // 👍 ohne Text: kurze positive Bestätigung, kein Speichern
      bar.querySelector('.mmb-fb-saved')?.remove();
      bar.querySelectorAll('.mmb-fb-panel').forEach(p => p.remove());
      const saved = document.createElement('span');
      saved.className = 'mmb-fb-saved';
      saved.textContent = '👍 Danke!';
      bar.appendChild(saved);
      setTimeout(() => saved.remove(), 3000);
    };

    thumbDown.onclick = () => openPanel('');
  }

  /** Sendet eine Schüler-Präferenz an den Server. */
  async _saveFeedback(preferenceText) {
    const activityId = this.settings.activityId;
    const userId     = this.settings.userId;
    if (!activityId || !userId) {
      console.warn('[Feedback] activityId oder userId fehlt – Memory nicht gespeichert');
      return;
    }
    try {
      await fetch(`${this._baseUrl()}/api/student-memory/${encodeURIComponent(activityId)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, preferenceText }),
      });
    } catch (e) {
      console.error('[Feedback] Speichern fehlgeschlagen:', e);
    }
  }

  // ── Issue #53: Memory-Overlay ─────────────────────────────────────────────

  async openMemoryOverlay() {
    const overlay = document.getElementById('memory-overlay');
    if (!overlay) return;
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    const userId = this.settings.userId;
    if (!activityId || !userId) {
      console.warn('[Memory] activityId oder userId fehlt');
      return;
    }
    overlay.style.display = 'flex';
    const textarea = document.getElementById('memory-overlay-textarea');
    if (textarea) textarea.value = '';
    try {
      const resp = await fetch(
        `${this._baseUrl()}/api/student-memory/${encodeURIComponent(activityId)}?userId=${encodeURIComponent(userId)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        if (textarea) textarea.value = data.memory ?? '';
      }
    } catch (e) {
      console.error('[Memory] Laden fehlgeschlagen:', e);
    }
    if (textarea) textarea.focus();
  }

  closeMemoryOverlay() {
    const overlay = document.getElementById('memory-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async _saveMemory() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    const userId = this.settings.userId;
    const textarea = document.getElementById('memory-overlay-textarea');
    const preferenceText = textarea?.value?.trim() ?? '';
    if (!activityId || !userId) {
      console.warn('[Memory] activityId oder userId fehlt');
      return;
    }
    if (!preferenceText) {
      await this._deleteMemory();
      return;
    }
    try {
      const resp = await fetch(
        `${this._baseUrl()}/api/student-memory/${encodeURIComponent(activityId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, preferenceText }),
        }
      );
      if (resp.ok) {
        this.closeMemoryOverlay();
      } else {
        console.error('[Memory] Speichern fehlgeschlagen:', resp.status);
      }
    } catch (e) {
      console.error('[Memory] Netzwerkfehler beim Speichern:', e);
    }
  }

  async _deleteMemory() {
    const activityId = this.settings.activityId
      || new URLSearchParams(window.location.search).get('id')
      || '';
    const userId = this.settings.userId;
    if (!activityId || !userId) {
      console.warn('[Memory] activityId oder userId fehlt');
      return;
    }
    try {
      const resp = await fetch(
        `${this._baseUrl()}/api/student-memory/${encodeURIComponent(activityId)}?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
      if (resp.ok) {
        const textarea = document.getElementById('memory-overlay-textarea');
        if (textarea) textarea.value = '';
        this.closeMemoryOverlay();
      } else {
        console.error('[Memory] Löschen fehlgeschlagen:', resp.status);
      }
    } catch (e) {
      console.error('[Memory] Netzwerkfehler beim Löschen:', e);
    }
  }

  // ── Issue #42: Links/Rechts-Toggle ───────────────────────────────────────

  _toggleSide() {
    const newSide = this._positionSide === 'right' ? 'left' : 'right';
    this._positionSide = newSide;
    sessionStorage.setItem('moogpt-side', newSide);

    const chatContainer  = document.getElementById('chat-container');
    const chatIcon       = document.getElementById('chat-icon');
    const dashboardIcon  = document.getElementById('dashboard-icon');
    const configIcon     = document.getElementById('config-icon');
    const stopIcon       = document.getElementById('stop-icon');
    const memoryIcon     = document.getElementById('memory-icon');

    [chatContainer, chatIcon, dashboardIcon, configIcon, stopIcon, memoryIcon].forEach(el => {
      if (!el) return;
      if (newSide === 'left') {
        el.classList.add('left-side');
      } else {
        el.classList.remove('left-side');
      }
    });
  }

  // ── P3: Plenum-Overlay ────────────────────────────────────────────────────

  _showLockOverlay() {
    let overlay = document.getElementById('mmb-lock-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mmb-lock-overlay';
      overlay.style.cssText = [
        'position:absolute', 'inset:0',
        'background:rgba(0,51,102,0.92)', 'color:white',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'gap:12px', 'z-index:10',
        'font-family:Arial,sans-serif', 'border-radius:inherit',
      ].join(';');
      overlay.innerHTML =
        '<div style="font-size:36px">🔒</div>' +
        '<div style="font-size:15px;font-weight:600;text-align:center;padding:0 24px">Plenumsphase aktiv</div>' +
        '<div style="font-size:13px;opacity:0.8;text-align:center;padding:0 24px">Die Lehrperson hat den Chat vorübergehend gesperrt.</div>';
      const container = document.getElementById('chat-container');
      if (container) {
        container.appendChild(overlay);
      }
    }
    overlay.style.display = 'flex';
    this._disableInput();
  }

  _hideLockOverlay() {
    const overlay = document.getElementById('mmb-lock-overlay');
    if (overlay) overlay.style.display = 'none';
    this._enableInput();
  }
}
