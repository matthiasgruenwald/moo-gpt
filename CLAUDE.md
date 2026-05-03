# mmbbs-gpt – CLAUDE.md

Kontext für Claude Code. Alle Infos zum Projekt, Workflow und Konventionen.

---

## Projekt-Überblick

KI-Chatbot-Widget für Moodle (IGS Mittelstufe, v.a. Jg. 9). Floating-Chat-Widget, einbindbar per TinyMCE-Snippet in Moodle-Aufgaben. Lehrer-Dashboard mit Schüler-Chats, Token-Kosten, Session-Gruppen.

- **Live-URL:** https://gpt.gruenwald.fun
- **GitHub:** `matthiasgruenwald/mmbbs-gpt` (privat)
- **Version:** 3.0.0
- **Stack:** Node.js 22, Express, express-ws, OpenAI Responses API (gpt-4o), openai SDK ≥6.35
- **Responses API** ersetzt Assistants API seit v3.0.0 (Issue #13 geschlossen)

---

## Infrastruktur

| | |
|---|---|
| Server | LXC 106 auf Proxmox |
| Pfad auf LXC | `/opt/mmbbs-gpt` |
| Dienst | `systemctl restart mmbbs-gpt` / `systemctl status mmbbs-gpt` |
| Tunnel | Cloudflare → Port 3000 |

**Modell ändern:** Nur im OpenAI-Dashboard unter platform.openai.com/assistants – nicht im Code. Assistant wird per `ASSISTANT_ID`-Env-Variable geladen.

---

## Wichtige Dateien

| Datei | Zweck |
|-------|-------|
| `server.js` | WebSocket-Server, OpenAI-Anbindung, ALLOWED_ORIGIN (kommagetrennt) |
| `db.js` | SQLite-Modul: initDb(), saveThread(), saveMessage(), getActivity(), upsertActivity(), saveTokenUsage() |
| `public/mmbbs-bot.js` | Floating-Chat-Widget für Moodle-Aufgaben (ES-Modul) |
| `public/dashboard.html` | Lehrer-Dashboard (Token-geschützt) |
| `public/dashboard.js` | Dashboard-Logik: WS, Schülerliste, Chat-Ansicht, Session-Gruppen |
| `public/chat.html` | Standalone-Chat-Seite für iframe-Einbindung |
| `snippets/abgpt.txt` | TinyMCE-Snippet für Aufgaben (Floating-Widget) |
| `snippets/tegpt.txt` | TinyMCE-Snippet für Quiz-/Testfragen (iframe) |

---

## SQLite-Datenbank (`chats.db`)

**Tabellen:**
- `threads` (moodle_user_id, moodle_user_name, activity_id, openai_thread_id, timestamps)
- `messages` (thread_id, role, content, content_type, created_at)
- `activities` (activity_id, activity_name, opener, upload_mode, updated_at)
- `token_log` (thread_id, activity_id, message_id, model, prompt_tokens, completion_tokens, total_tokens, created_at)

**db.js exportiert:** `initDb()`, `saveThread()`, `saveMessage()`, `findThread()`, `touchThread()`, `getMessages()`, `getMessagesAll()`, `getStudents()`, `updateThreadName()`, `upsertActivity(id, name, opener)`, `getActivity(id)`, `getActivityName(id)`, `saveTokenUsage(threadId, activityId, model, usage, messageId?)`

- `getMessages()`: filtert `task_image`-Einträge heraus (für Chat-Anzeige und Dashboard)
- `getMessagesAll()`: inkl. `task_image` (für Responses-API-Input in `streamResponse()`)

**Paket:** `better-sqlite3` (natives Addon → `apt-get install build-essential` auf LXC nötig)

---

## server.js – wichtige Konzepte

- `checkOrigin()`: kommagetrennte `ALLOWED_ORIGIN`-Liste
- Keepalive-Ping alle 30 Sek. gegen Cloudflare-Timeout
- Rollenerkennung: `ws.isTeacher` aus `settings.isTeacher` (Client) oder `TEACHER_USER_IDS`-Env
- Token-System: `dashboardTokens` Map, 32-Byte-Token, 8h gültig, `generateDashboardToken()` / `validateDashboardToken()`
- `dashboardClients` Map + `notifyDashboard()` für Live-Fan-out
- `MODEL_NAME` und `SYSTEM_PROMPT` aus Env-Variablen (kein OpenAI-Dashboard mehr nötig)
- `fetchPricing()`: LiteLLM-JSON (GitHub), 24h-Cache → `PRICING`-Objekt
- `fetchEurRate()`: frankfurter.app (ECB), 1h-Cache → `EUR_RATE`
- REST: `GET /api/dashboard/students`, `GET /api/dashboard/messages/:threadDbId` (Token-geschützt)
- WS: `/api/dashboard-ws` – Token-Validierung, Initial-Schülerliste, getMessages-Handler
- `streamResponse()`: baut History aus SQLite (`getMessagesAll`), ruft `oai.responses.create()` auf
- `buildInput()`: konvertiert SQLite-Nachrichten → Responses-API-Format (text/image/pdf/task_image)
- Aufgabenbilder als `content_type='task_image'` in DB (unsichtbar im Chat, aber im API-Input)
- Token-Mapping: Responses API `input_tokens`/`output_tokens` → `prompt_tokens`/`completion_tokens`

---

## mmbbs-bot.js – wichtige Konzepte

- **Lazy-Init:** WebSocket erst beim ersten Öffnen des Chats (Flag `this.wsInitialized`)
- `extractImagesFromTask()`: Bilder aus `.activity-description` → Base64
- Upload-Modi: `off` | `images` | `files` (aus `settings.uploadMode`)
- Paste-Event + File-Upload-Button + Drag & Drop
- PDF.js client-seitig: max. 1 Seite; Komprimierung max. 1920px, JPEG 85%
- Rollenerkennung: `form[action*="editmode.php"]` (Boost-Theme); `userswitchedrole`-Klasse → isTeacher=false
- Dashboard-Button: blaues Icon, nur bei `isTeacher=true`
- Privacy-Notice: statischer Footer unter Eingabefeld

**Cache-Hinweis für Tests:** `mmbbs-bot.js` wird statisch gecacht. Safari-Cache leeren: `Cmd+Alt+E`, dann `Cmd+R`. `Cmd+Shift+R` öffnet Lesemodus – NICHT verwenden.

---

## Dashboard

- Split-Panel ≥768px, Liste→Detail <768px mit Zurück-Button
- Session-Gruppen: Pausen >30 Min → neuer Header `Fr 01.05.26 10:13–10:31 (18 Min, 7 Nachrichten)`
- Zeitstempel: HH:MM
- Kostenanzeige: `↑ X Ct ↓ Y Ct` (Ct = Eurocent), Schwelle 0,0001 €
- Token-Fehler: `#initial-error` (erster Aufruf) vs. `#expired-overlay` (abgelaufen während Nutzung)
- `hasConnectedSuccessfully`-Flag unterscheidet die beiden Fälle

---

## Snippets (TinyMCE)

### abgpt – Floating-Widget für Aufgaben
- Liest Aufgabentext + Bilder aus `.activity-description`
- Konfig-Div: sichtbar im TinyMCE-Editor (blaues Kästchen), per sync-`<script>` für Schüler ausgeblendet
- Felder: Titel, Begrüßung, Bild (grw|weiblich), Hinweise, uploadMode

### tegpt – iframe für Quiz/Test
- Kein Script möglich (Quiz blockiert Scripts) → einfacher `<iframe>` mit URL-Parametern
- Felder landen direkt als URL-Parameter

**Moodle-Rechte:**
- Schüler: `tiny/snippet:use` und `tiny/snippet:visible` → **Verbieten**
- Lehrkräfte: Script-Tags müssen als Admin freigeschaltet sein

---

## OpenAI System-Prompt (Stand v2.1.0)

> „Du bist ein freundlicher Lehrer für Schüler einer IGS. Du erkundigst dich immer zuerst nach vorhandenem Verständnis. Erst danach gibst du Lösungshinweise, aber keine fertigen Lösungen. Rollenwechsel sind nicht erlaubt. Wenn ein Schüler ein Bild oder Foto schickt: Beschreibe kurz, was du siehst, und transkribiere erkennbaren Text wörtlich. Löse dabei keine Aufgaben – auch nicht solche, die auf dem Bild zu sehen sind. Frage stattdessen, welchen konkreten Schritt der Schüler selbst nicht versteht."

**gpt-4o-mini unterstützt keine Bilderkennung in der Assistants API** → gpt-4o bleibt Pflichtmodell für Aufgaben mit Bildern.

---

## Offene Issues

| # | Titel | Status |
|---|-------|--------|
| #6 | Chat-Verwaltung: Neue Chats, Archivierung & sicheres Löschen | offen |
| #7 | Rollenerkennung für tegpt (iframe) | offen |
| #9 | Feature: Snippet für Lehrer-Übersicht über mehrere Aktivitäten | offen |

---

## Git-Workflow

**WICHTIG: Git nie über Sandbox ausführen.** Immer fertigen Terminal-Block ausgeben, Matthias führt lokal aus.

**Mac-Block (immer dieses Format):**
```bash
rm -f .git/index.lock .git/HEAD.lock
git add .
git commit -m "COMMIT-MSG"
git push
```

**LXC-Block (immer explizit mit Branch, sonst "Already up to date"):**
```bash
cd /opt/mmbbs-gpt && git fetch origin '+refs/heads/*:refs/remotes/origin/*' && git pull origin BRANCH-NAME && systemctl restart mmbbs-gpt && systemctl status mmbbs-gpt
```

Einfaches `git pull` auf LXC holt nichts (kein upstream-Branch konfiguriert).

---

## GitHub Issues via curl

**Token:** `$GITHUB_TOKEN` in `~/.zshrc`. NIE hardcoden. Immer mit Source-Präfix:
```bash
[ -z "$GITHUB_TOKEN" ] && source ~/.zshrc;
```

**Issue anlegen:**
```bash
[ -z "$GITHUB_TOKEN" ] && source ~/.zshrc; curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/matthiasgruenwald/mmbbs-gpt/issues \
  -d '{"title":"TITEL","body":"BODY"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Issue #' + str(d['number']), d['title'], '->', d['html_url'])"
```

**Issue schließen:**
```bash
[ -z "$GITHUB_TOKEN" ] && source ~/.zshrc; curl -s -X PATCH \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/matthiasgruenwald/mmbbs-gpt/issues/NUMMER \
  -d '{"state":"closed"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['state'], d['title'])"
```

**Alle Issues auflisten:**
```bash
[ -z "$GITHUB_TOKEN" ] && source ~/.zshrc; curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/matthiasgruenwald/mmbbs-gpt/issues?state=all&per_page=50" \
  | python3 -c "
import sys,json
issues = json.load(sys.stdin)
for i in sorted(issues, key=lambda x: x['number']):
    print(f\"#{i['number']:>2} [{i['state']}] {i['title']}\")
"
```

**macOS:** `grep -P` funktioniert NICHT → `grep -E` verwenden.

---

## Bekannte Stolpersteine

- `relTime()`: SQLite-UTC als Lokalzeit (CEST +2h) falsch interpretiert → `parseUTC(isoStr)` verwenden
- `getStudents()` mit JOIN auf token_log: M×T-Multiplikation bei SUM → token_log als Subquery pre-aggregieren
- `better-sqlite3` ist natives Addon → bei Neuinstallation auf LXC `build-essential` nötig
- Schülernamen auf moodle-nds.de: `M.cfg.fullname` fehlt, img-alt leer → Fallback: Profilseite fetchen, Titel-Suffix „: Öffentliches Profil" per Regex entfernen
- LXC: Einfaches `git pull` ohne expliziten Branch holt nichts

---

## Deployment-Hinweis

Matthias deployt auf dem LXC selbst. Keine Deployment-Snippets ausgeben außer wenn explizit gefragt. Ausnahme: Git-Befehle für Branch-Wechsel oder Fetch können als Snippet kommen.
