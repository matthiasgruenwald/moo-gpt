import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/+esm";
import renderMathInElement from "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.mjs";
import prismEs6 from "https://cdn.jsdelivr.net/npm/prism-es6@1.2.0/+esm";

// Load language java for syntax highlighting
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-java.min.js";
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-python.min.js";
import "https://cdn.jsdelivr.net/npm/prismjs/components/prism-json.min.js";

export class MMBBSBOT {
  constructor(settings) {
    this.settings = settings;
    this.msgCount = 0;
    this.ws = null;
    this.wsInitialized = false;
    this.dashboardToken          = null;  // Issue #5: vom Server zugewiesen
    this.pendingDashboardOpen    = false; // Issue #5: Dashboard-Tab nach Token-Empfang öffnen
    this.pendingDashboardWindow  = null;  // Issue #5: vorab geöffnetes about:blank-Fenster
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
    } catch (error) {
      console.error("Error loading libraries:", error);
    }
  }

  createChatInterface() {
    console.log("createChatInterface");

    // Load CSS
    const head = document.querySelector("head");
    const css = document.createElement("link");
    css.href = `${this.settings.protocol}://${this.settings.host}:${this.settings.port}/styles.css`;
    css.rel = "stylesheet";
    head.appendChild(css);

    // Issue #4 / #5: Rollenerkennung früh (sync) – wird in setupWebSocket bestätigt
    const hasEditMode = document.querySelector('form[action*="editmode.php"]') !== null;
    const isSwitchedRole = document.body.className.includes('userswitchedrole');
    const isTeacher = hasEditMode && !isSwitchedRole;
    this.settings.isTeacher = isTeacher;

    // Create chat icon
    const chatIcon = document.createElement("div");
    const icon =
      this.settings.chat_icon ||
      `${this.settings.protocol}://${this.settings.host}:${this.settings.port}/chat-icon.png`;
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
    const title = this.settings.title || "MMBbS GPT";

    chatHeader.className = "chat-header";
    chatHeader.innerHTML = `
        <div class="chat-header-icon-container">
            <img src="${icon}" alt="Chat Icon" class="chat-header-icon">
        </div>
        <h1>${title}</h1>
        <div class="header-icon" onclick="toggleChat()">
            <img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/close-icon.png" alt="Close Icon">
        </div>`;
    chatContainer.appendChild(chatHeader);

    // Create chat window
    const opener = this.settings.opener || "Hallo, wie kann ich Ihnen helfen?";
    const chatWindow = document.createElement("div");
    chatWindow.id = "chat-window";
    chatWindow.className = "chat-window";
    chatWindow.innerHTML = `
        <div class="message received">
            <p>${opener}</p>
        </div>`;
    chatContainer.appendChild(chatWindow);

    // Create input container
    const uploadMode = this.settings.uploadMode || 'off';
    const inputContainer = document.createElement("div");
    inputContainer.className = "input-container";
    inputContainer.innerHTML = this._buildInputHTML(uploadMode);
    chatContainer.appendChild(inputContainer);

    // Upload-Logik anhängen (nach DOM-Einfügen)
    if (uploadMode !== 'off') {
      // Upload-Button → File-Input öffnen
      inputContainer.querySelector('#upload-button')?.addEventListener('click', () => {
        inputContainer.querySelector('#file-input')?.click();
      });
      // File-Input versteckt
      const fileInput = inputContainer.querySelector('#file-input');
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileUpload(file);
        e.target.value = '';
      });
      // Drag & Drop auf Chat-Container
      chatContainer.addEventListener('dragover', (e) => { e.preventDefault(); chatContainer.classList.add('drag-over'); });
      chatContainer.addEventListener('dragleave', () => chatContainer.classList.remove('drag-over'));
      chatContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        chatContainer.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this.handleFileUpload(file);
      });
      // Paste
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
    }

    // Privacy notice
    const privacyNotice = document.createElement("div");
    privacyNotice.className = "privacy-notice";
    privacyNotice.textContent = "🔒 Chats können von Lehrkräften eingesehen werden.";
    chatContainer.appendChild(privacyNotice);

    // Check if main-inner exists
    const mainInner = document.querySelector(".main-inner");

    // Issue #5: Dashboard-Button für Lehrer (erscheint über dem Chat-Button)
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
    }

    document.body.appendChild(chatIcon);
    document.body.appendChild(chatContainer);

    // Make toggleChat, sendMessage, and handleKeyDown available globally
    window.toggleChat = this.toggleChat.bind(this);
    window.sendMessage = this.sendMessage.bind(this);
    window.handleKeyDown = this.handleKeyDown.bind(this);

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
    const base = `${this.settings.protocol}://${this.settings.host}:${this.settings.port}`;
    const url  = `${base}/dashboard.html?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;
    if (this.pendingDashboardWindow && !this.pendingDashboardWindow.closed) {
      this.pendingDashboardWindow.location.href = url;
      this.pendingDashboardWindow = null;
    } else {
      window.open(url, '_blank');
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
    if (!this.settings.task) return images;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.settings.task, "text/html");
      const imgTags = doc.querySelectorAll("img");
      for (const img of imgTags) {
        try {
          const response = await fetch(img.src);
          const blob = await response.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          images.push(base64);
          console.log("Image extracted:", img.src);
        } catch (err) {
          console.warn("Could not fetch image:", img.src, err);
        }
      }
    } catch (err) {
      console.warn("Error extracting images:", err);
    }
    return images;
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
      if (userId)        this.settings.userId       = userId;
      if (userName)      this.settings.userName     = userName;
      if (activityId)    this.settings.activityId   = activityId;
      if (activityName)  this.settings.activityName = activityName;
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
      const images = await this.extractImagesFromTask();
      if (images.length > 0) {
        this.settings.images = images;
        console.log(`${images.length} Bild(er) aus Aufgabenstellung extrahiert`);
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

        // Issue #5: Dashboard-Token vom Server empfangen
        if (messageObj.type === "dashboardToken") {
          this.dashboardToken = messageObj.token;
          console.log(`[Bot] Dashboard-Token empfangen für activityId=${messageObj.activityId}`);
          if (this.pendingDashboardOpen) {
            this.pendingDashboardOpen = false;
            this._openDashboardTab(messageObj.token, messageObj.activityId);
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
      loading.innerHTML = `<img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/loading.gif" alt="Loading...">`;
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
      loading.innerHTML = `<img src="${this.settings.protocol}://${this.settings.host}:${this.settings.port}/loading.gif" alt="Loading...">`;
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
}
