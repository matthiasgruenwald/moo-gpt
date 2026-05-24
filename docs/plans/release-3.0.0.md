# Release Notes – v3.0.0

> **Status:** Entwurf – wird finalisiert sobald Issues #59–#72 (Werkzeug-Kosten) abgeschlossen sind.
>
> Verwendung: GitHub-Release-Body (kopieren ab der Trennlinie unten).

---

---

# v3.0.0 – Lehrer-Werkzeugkasten & stabile Architektur

Seit v2.0.0 (erstes Lehrer-Dashboard, Token-Auth, SQLite-Logging) hat sich moo-gpt von
einem reinen Chat-Widget zu einem vollständigen KI-Unterrichtswerkzeug entwickelt.
Diese Version schließt gleichzeitig eine komplette interne Umstrukturierung ab, die das
Projekt für Beiträge von außen öffnet.

---

## Für Lehrkräfte und Schulen

### Prompt-Werkzeuge

- **Prompt-Assistent** — Erfahrungsprompt per KI-Dialog erstellen: die KI stellt
  Klärungsfragen (Fach, Jahrgang, Rolle, Lernziel, Stil) und baut daraus einen
  vollständigen, strukturierten Prompt. Vorschlag erscheint als Vorschau, wird erst
  nach bewusstem „Übernehmen" gespeichert.
- **Prompt-Check** — Bestehenden Prompt auf Schwachstellen analysieren; verbesserte
  Version mit Word-Level-Diff (Gelöschtes rot, Neues grün) direkt übernehmen oder
  verwerfen.
- **Prompt-Optimierung per Simulation** — vollautomatisch (1-Klick: Kriterien
  generieren → Personas simulieren → Prompt vorschlagen) oder manuell Schritt für
  Schritt. Auch ohne echte Schüler-Chats nutzbar.
- **Erfahrungsprompt-Versionierung** — jede Änderung bleibt nachvollziehbar und
  wiederherstellbar.

### Dashboard (neu strukturiert)

Das Dashboard gliedert sich jetzt in drei Bereiche (Tab-Leiste oben):

- **Chats** — Schülerverläufe mit Live-Updates und Token-Kosten. KI-Antworten können
  inline bearbeitet werden; frühere Versionen bleiben erhalten, Schüler sehen beim
  nächsten Öffnen die aktive Version.
- **Überblick** — thematische Zusammenfassung aller Chats der Aktivität auf
  Knopfdruck (häufige Fragen, häufige Missverständnisse). Liste der noch nicht aktiven
  Schüler. Kein automatisches Polling.
- **Einstellungen** — globaler System-Prompt, Modell, eigene Personas (Admin-Bereich).

### Werkzeug-Kosten

Token-Verbrauch für KI-Werkzeuge (Simulation, Prompt-Check, Prompt-Assistent,
Live-Überblick) wird pro Aktivität erfasst und ist für Lehrkräfte transparent
einsehbar — auf `/dashboard/costs` mit Aufschlüsselung nach Werkzeug und einer
Admin-Übersicht aller Kosten.

### Im Unterricht

- **Stop-Button im Widget** — Plenumsmodus direkt aus dem Chat-Icon starten, ohne
  das Dashboard zu öffnen. Optional mit Timer; nach Ablauf wird der Chat automatisch
  freigegeben.
- **Schüler-Memory** — Schüler können Feedback geben und Präferenzen hinterlegen
  (z. B. „bitte kürzer antworten"). Die KI berücksichtigt diese Präferenz ab dem
  nächsten Chat-Start. Lehrkraft kann Memory pro Schüler im Dashboard einsehen,
  bearbeiten und auch selbst anlegen.
- **Widget-Position umschaltbar** — links oder rechts, je nach Aufgabenlayout
  (gespeichert für die aktuelle Browsersitzung).

### Chat-Widget

- Dateiupload (Bilder & PDF) mit Vorschau und Zoom
- LaTeX-Formeln werden korrekt gerendert
- Schüler können den Chat nach Seitenreload nahtlos fortsetzen (Thread-Persistenz)

---

## For developers

This release completes a full internal restructuring alongside the new teacher features.

### Architecture

**Route decomposition (11 steps)**  
`server.js` split into focused `routes/` modules: `admin`, `activity`, `dashboard`,
`criteria`, `simulation`, `personas`, `erfahrungsprompt`, `teacher`, `message-edits`,
`student-memory`, `dashboard-pages`.

**Store decomposition (10 steps)**  
`db.js` reduced to schema/migrations only; all domain logic moved to `stores/`:
`admin`, `activity`, `token`, `prompt`, `teacher`, `feedback`, `criteria`, `persona`,
`chat`, `dashboard`.

**OpenAI Responses API migration**  
All threads migrated from the deprecated Assistants API (EOL August 2026) to
`responses.create`. No data loss; existing chat history preserved.

**Security**  
`isTeacher` flag validated server-side; client-provided flag used as hint only.
`TEACHER_USER_IDS` env var allows explicit override per user ID.

### New modules

`lock-manager.js`, `validators.js`, `persona-selector.js`, `message-edits.js`,
`student-memory.js`, `cost-service.js`, `routes/dashboard-pages.js`

### New API endpoints

| Endpoint | Feature |
|---|---|
| `POST /api/activity/:id/prompt-check` | Prompt weakness analysis + suggestion |
| `POST /api/activity/:id/suggest-prompt` | AI-guided prompt creation (interactive) |
| `GET/POST/DELETE /api/student-memory/:id` | Per-student preference memory |
| `PUT /api/messages/:id/content` | Versioned message editing by teacher |
| `GET /api/messages/:id/versions` | Message version history |
| `POST /api/activity/:id/lock` | Classroom lock with optional timer |
| `DELETE /api/activity/:id/lock` | Classroom unlock |
| `GET /dashboard/chats` | Chat page (replaces /dashboard.html) |
| `GET /dashboard/overview` | Live class overview |
| `GET /dashboard/settings` | Settings page |
| `GET /dashboard/costs` | Tool cost breakdown per activity |

### Breaking changes

- `db.js` no longer exports domain functions — import from `stores/*.js`
- Dashboard entry point: `/dashboard.html` redirects to `/dashboard/chats`
- `textCall` / `jsonCall` in `ai-client.js` now return `{ text, usage }` instead of
  plain string — callers must destructure

### Dependency

Node.js 22, openai SDK ≥ 6.35, better-sqlite3 (native addon, requires build-essential)

---

## Tag-Befehl (wenn bereit)

```bash
# package.json Version aktualisieren
# dann:
git tag -a v3.0.0 -m "v3.0.0 – Lehrer-Werkzeugkasten & stabile Architektur"
git push origin v3.0.0
```

Dann auf GitHub → Releases → „v3.0.0" → „Create release from tag" → Release-Body
aus diesem Dokument ab der zweiten Trennlinie einfügen.
