# Contributing

## Architektur

moo-gpt ist ein Node.js-Server (Express + WebSocket) mit SQLite-Backend.

```
Browser (moo-bot.js)
    ↕ WebSocket / HTTP
Express-Server (server.js)
    ├── Routes (routes/*.js)
    ├── ChatSession (chat-session.js)
    └── AIClient (ai-client.js)
         ↕ OpenAI Responses API
        SQLite (db.js → chats.db)
```

Details: [`docs/architecture.md`](docs/architecture.md)

## Entwicklungsumgebung einrichten

```bash
git clone https://github.com/matthiasgruenwald/moo-gpt.git
cd moo-gpt
apt-get install -y build-essential   # für better-sqlite3
npm install
```

Env-Datei anlegen (mindestens `APIKEY` und `MODEL_NAME`):

```bash
cp INSTALL.md /dev/null   # Werte aus INSTALL.md übernehmen
export APIKEY=sk-proj-...
export MODEL_NAME=gpt-5
npm start
```

## Wichtige Dateien

| Datei | Zweck |
|---|---|
| `server.js` | Express-Server, Route-Mounting, WebSocket-Handler, `streamResponse` |
| `chat-session.js` | WebSocket-Lifecycle pro Schüler-Verbindung |
| `ai-client.js` | OpenAI-Wrapper: `stream`, `textCall`, `jsonCall` |
| `ai-instance.js` | OpenAI-Client-Singleton – hier Azure-Support einbauen (Issue #32) |
| `db.js` | SQLite-Zugriff (better-sqlite3) |
| `prompt-builder.js` | System-Prompt zusammensetzen aus systemContent, hints, task, Erfahrungsprompt |
| `config-cache.js` | Gecachte DB-Konfiguration (System-Prompt, Modell) |
| `env-config.js` | Berechnete Env-Konstanten: MODEL_NAME, AVAILABLE_MODELS |
| `routes/` | REST-Endpunkte: activity, dashboard, admin, teacher, criteria, simulation, … |
| `public/moo-bot.js` | Chat-Widget (ES-Modul, läuft im Browser) |
| `public/dashboard.*` | Lehrer-Dashboard (HTML + JS) |

## Datenbankschema (Kurzübersicht)

| Tabelle | Inhalt |
|---|---|
| `threads` | Ein Eintrag pro Schüler + Aufgabe: userId, userName, activityId, OpenAI-Thread-ID |
| `messages` | Alle Nachrichten chronologisch: role, content, content_type |
| `activities` | Aufgabentitel je activity_id |
| `token_log` | API-Kosten pro Nachricht |
| `config` | System-Prompt, aktives Modell (wird beim Erststart aus Env befüllt) |

## Konventionen

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` …
- Reines ESM, keine Transpilierung – Node.js 22 vorausgesetzt
- Neue Features als Issue anlegen, bevor die Implementierung beginnt

## Offene Issues

| # | Thema |
|---|---|
| #6 | Chat-Verwaltung: Neue Chats, Archivierung & sicheres Löschen |
| #7 | Rollenerkennung für tegpt (iframe) |
| #9 | Snippet für Lehrer-Übersicht über mehrere Aktivitäten |
| #32 | Azure OpenAI / EU-Inferenz-Residency unterstützen |

Aktuelle Issues: https://github.com/matthiasgruenwald/moo-gpt/issues

## Versionsverlauf

| Version | Änderung |
|---|---|
| 3.0.0 | DB-Decomposition: stores/ Architektur, Refactoring der Datenbankzugriffe |
| 2.0.0 | Lehrer-Dashboard, Token-Auth, Fan-out, activities-Tabelle |
| 1.11.0 | Rollenerkennung Lehrer/Schüler via DOM + userswitchedrole |
| 1.10.0 | Chatverlauf beim Öffnen anzeigen, Zeitstempel auf allen Nachrichten |
| 1.9.0 | Thread-Persistenz + Reconnect |
| 1.8.0 | SQLite-Logging |
| 1.7.0 | Keepalive-Ping gegen Cloudflare-Timeout |
| 1.6.x | Lazy-Init, Bilder-Upload via OpenAI Files API |
