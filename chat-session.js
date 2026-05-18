import { upsertActivity, getActivity } from './stores/activity.js';
import { getActiveErfahrungsprompt, saveErfahrungsprompt } from './stores/prompt.js';
import { getTeacherDefaultTemplate, getSystemTemplate } from './stores/teacher.js';
import {
  findThread, touchThread, updateThreadName, saveThread, saveMessage, getMessages,
} from "./db.js";

function detectRole(settings) {
  const teacherIds = process.env.TEACHER_USER_IDS
    ? process.env.TEACHER_USER_IDS.split(',').map(s => s.trim())
    : [];
  const isTeacherByEnv = !!(settings.userId && teacherIds.includes(settings.userId));
  return settings.isTeacher === true || isTeacherByEnv;
}

async function resolveActivity(activityId, activityName, isTeacher, userId, hints) {
  let act = getActivity(activityId);
  if (!act) {
    const defaults = isTeacher && userId
      ? (getTeacherDefaultTemplate(userId) ?? getSystemTemplate())
      : null;
    upsertActivity(
      activityId,
      activityName || activityId,
      defaults?.opener      ?? null,
      defaults?.upload_mode ?? 'off',
      defaults?.title       ?? null,
      defaults?.bot_icon    ?? 'grw',
    );
    act = getActivity(activityId);
  } else if (activityName && activityName !== act.activity_name) {
    upsertActivity(activityId, activityName, null, null, null, null);
  }

  if (hints && !getActiveErfahrungsprompt(activityId)) {
    saveErfahrungsprompt(activityId, hints, userId || 'moodle-import');
    console.log(`[Settings] Aufgabenprompt (hints) für ${activityId} aus Snippet importiert`);
  }

  return {
    title:      act?.title       ?? null,
    botIcon:    act?.bot_icon    ?? 'grw',
    opener:     act?.opener      ?? null,
    uploadMode: act?.upload_mode ?? 'off',
    needsConfig: act?.title == null,
  };
}

async function resolveThread(userId, userName, activityId, images) {
  let existingThreadRow = null;
  if (userId && activityId) {
    existingThreadRow = findThread({ moodle_user_id: userId, activity_id: activityId });
  }

  let threadDbId;
  if (existingThreadRow) {
    threadDbId = existingThreadRow.id;
    touchThread(threadDbId);
    if (!existingThreadRow.moodle_user_name && userName) {
      updateThreadName(threadDbId, userName);
      console.log(`[DB] Namen nachgefüllt: ${userName} (db_id=${threadDbId})`);
    }
    console.log(`[DB] Bestehenden Thread wiederverwendet (db_id=${threadDbId})`);
  } else {
    threadDbId = saveThread({
      moodle_user_id:   userId      || null,
      moodle_user_name: userName    || null,
      activity_id:      activityId  || null,
    });
    console.log(`[DB] Neuer Thread angelegt, db_id=${threadDbId}`);

    if (images && images.length > 0) {
      let saved = 0;
      for (const img of images) {
        try {
          const imgClean = typeof img === 'string' ? img.trim() : img;
          if (!imgClean) continue;
          let dataUrl;
          if (imgClean.startsWith('data:')) {
            dataUrl = imgClean;
          } else {
            const parsed = new URL(imgClean);
            if (!['http:', 'https:'].includes(parsed.protocol)) continue;
            const res = await fetch(imgClean);
            if (!res.ok) { console.log(`[Settings] Bild übersprungen (HTTP ${res.status})`); continue; }
            const mimeType = res.headers.get('content-type') || 'image/jpeg';
            const buf = Buffer.from(await res.arrayBuffer());
            dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
          }
          saveMessage({ thread_db_id: threadDbId, role: 'user', content: dataUrl, content_type: 'task_image' });
          saved++;
        } catch (e) {
          console.warn('[Settings] Aufgabenbild übersprungen:', e.message);
        }
      }
      console.log(`[DB] ${saved} Aufgabenbild(er) als task_image gespeichert`);
    }
  }

  const history = existingThreadRow ? getMessages(threadDbId) : [];
  return { threadDbId, history };
}

export class ChatSession {
  constructor(ws, deps) {
    this.ws = ws;
    this._deps = deps;
    this.settings = null;
    this.threadDbId = null;
    this.activityConfig = null;
    this.isTeacher = false;
    this._keepalive = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000);
    ws.on("close", () => this._cleanup());
  }

  _cleanup() {
    clearInterval(this._keepalive);
    if (this.settings?.activityId) {
      this._deps.chatRegistry.unregister(this.settings.activityId, this.ws);
    }
  }

  async init(settings) {
    this.settings = settings;
    this.isTeacher = detectRole(settings);
    console.log(`[Auth] isTeacher=${this.isTeacher} (client=${settings.isTeacher})`);

    if (settings.activityId) {
      const activityConfig = await resolveActivity(
        settings.activityId, settings.activityName, this.isTeacher, settings.userId, settings.hints
      );
      this.activityConfig = activityConfig;
      this.ws.send(JSON.stringify({ type: 'config', activityId: settings.activityId, config: activityConfig }));
      console.log(`[P5a] Config für ${settings.activityId} gesendet, needsConfig=${activityConfig.needsConfig}`);
    }

    // P3: Chat-Client registrieren (nur Schüler) + ggf. sofort sperren
    if (settings.activityId && !this.isTeacher) {
      const aid = String(settings.activityId);
      const { chatRegistry, activityLocks } = this._deps;
      chatRegistry.register(aid, this.ws);
      if (activityLocks.has(aid)) this.ws.send(JSON.stringify({ type: 'locked' }));
    }

    // Issue #5: Dashboard-Token für Lehrer
    if (this.isTeacher && settings.activityId) {
      const token = this._deps.generateDashboardToken(settings.activityId, settings.userId, settings.userName || null);
      this.ws.send(JSON.stringify({ type: 'dashboardToken', token, activityId: settings.activityId }));
      console.log(`[Dashboard] Token für Lehrer ${settings.userId} / Aufgabe ${settings.activityId} erzeugt`);
    }

    const { threadDbId, history } = await resolveThread(
      settings.userId, settings.userName, settings.activityId, settings.images
    );
    this.threadDbId = threadDbId;
    if (history.length > 0) {
      this.ws.send(JSON.stringify({ type: "history", messages: history }));
      console.log(`[DB] ${history.length} Nachrichten an Client gesendet`);
    }
  }

  async handleChat(msgObj) {
    if (!this.threadDbId) {
      this.ws.send(JSON.stringify({ end: true, messages: "⏳ Verbindung wird aufgebaut, bitte nochmal senden..." }));
      return;
    }
    if (msgObj.data.message === "about") {
      this.ws.send(JSON.stringify({
        end: true,
        messages: `**Version ${this._deps.VERSION}**\r\n\r\n© 2024 Dr. Jörg Tuttas · Erweitert 2026 von Matthias Grünwald`,
      }));
      return;
    }
    saveMessage({ thread_db_id: this.threadDbId, role: 'user', content: msgObj.data.message });
    if (this.settings.activityId) {
      this._deps.dashboardRegistry.broadcast(this.settings.activityId, {
        type: 'newMessage', threadDbId: this.threadDbId,
        userId:    this.settings.userId   || null,
        userName:  this.settings.userName || null,
        role:      'user',
        content:   msgObj.data.message,
        createdAt: new Date().toISOString(),
      });
    }
    this._deps.streamResponse(this.ws, this.settings, this.threadDbId);
  }

  async handleFile(msgObj) {
    const uploadMode = this.activityConfig?.uploadMode || this.settings?.uploadMode || 'off';
    if (uploadMode === 'off') {
      this.ws.send(JSON.stringify({ end: true, messages: '⚠️ Upload ist für diese Aufgabe nicht aktiviert.' }));
      return;
    }
    const { file, originalType } = msgObj.data;
    if (originalType === 'video') {
      this.ws.send(JSON.stringify({ end: true, messages: '⚠️ Videos werden nicht unterstützt.' }));
      return;
    }
    if (originalType === 'pdf' && uploadMode !== 'files') {
      this.ws.send(JSON.stringify({ end: true, messages: '⚠️ PDF-Upload ist für diese Aufgabe nicht aktiviert (nur Bilder erlaubt).' }));
      return;
    }
    if (!this.threadDbId) {
      this.ws.send(JSON.stringify({ end: true, messages: '⏳ Verbindung wird aufgebaut, bitte nochmal senden...' }));
      return;
    }
    try {
      const mimeMatch = file.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const b64 = file.replace(/^data:[^;]+;base64,/, '');
      const imageBuffer = Buffer.from(b64, 'base64');
      console.log(`[Upload] originalType=${originalType}, mimeType=${mimeType}, size=${imageBuffer.length}`);

      if (mimeType.startsWith('video/')) {
        this.ws.send(JSON.stringify({ end: true, messages: '⚠️ Videos werden nicht unterstützt.' }));
        return;
      }

      const TWO_MB = 2 * 1024 * 1024;
      let dbContent;
      if (imageBuffer.length < TWO_MB) {
        dbContent = file;
      } else {
        const ext = mimeType.split('/')[1]?.split('+')[0] || 'jpeg';
        const uploadedFile = await this._deps.oai.files.create({
          file: new File([imageBuffer], `upload.${ext}`, { type: mimeType }),
          purpose: 'vision',
        });
        dbContent = `[${originalType}:${uploadedFile.id}]`;
        console.log(`[Upload] Große Datei → Files API, file_id=${uploadedFile.id}`);
      }
      const contentType = originalType === 'pdf' ? 'pdf' : 'image';

      saveMessage({ thread_db_id: this.threadDbId, role: 'user', content: dbContent, content_type: contentType });
      if (this.settings.activityId) {
        this._deps.dashboardRegistry.broadcast(this.settings.activityId, {
          type: 'newMessage', threadDbId: this.threadDbId,
          userId: this.settings.userId || null, userName: this.settings.userName || null,
          role: 'user', content: dbContent, contentType,
          createdAt: new Date().toISOString(),
        });
      }

      this._deps.streamResponse(this.ws, this.settings, this.threadDbId);
    } catch (err) {
      console.error('[Upload] Fehler:', err);
      this.ws.send(JSON.stringify({ end: true, messages: `⚠️ Upload fehlgeschlagen: ${err.message}` }));
    }
  }
}
