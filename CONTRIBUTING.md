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

**Interaktiver Dependency-Graph** (automatisch aus dem Code generiert):
[→ graph.html öffnen](https://gpt.gruenwald.fun/graphify/graph.html)

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

## Claude Code

Das Projekt enthält `.claude/settings.json` mit vordefinierten Tool-Berechtigungen (git, gh, node --test, …), sodass Claude Code ohne manuelle Permission-Prompts auskommt. `settings.local.json` ist gitigniert – dort können maschinenspezifische Ergänzungen eingetragen werden.

**Empfohlene Skills** – einmalig installieren oder aktualisieren mit:

```bash
npx skills@latest add mattpocock/skills
```

| Skill | Verwendung |
|---|---|
| [`karpathy-guidelines`](https://github.com/multica-ai/andrej-karpathy-skills) | Code-Review-Leitlinien (separates Paket, nicht in npx-Befehl oben enthalten) |
| `grill-with-docs` | Architektur-Entscheidungen gegen CONTEXT.md testen |
| `improve-codebase-architecture` | Refactoring-Kandidaten finden |
| `handoff` | Session-Übergabe zwischen Claude-Instanzen |
| `graphify` | Interaktiver Dependency-Graph aus dem Code |

## Konventionen

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` …
- Reines ESM, keine Transpilierung – Node.js 22 vorausgesetzt
- Neue Features als Issue anlegen, bevor die Implementierung beginnt

## Issues

→ https://github.com/matthiasgruenwald/moo-gpt/issues

## Versionsverlauf

→ [docs/changelog.md](docs/changelog.md)
