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

- Conventional Commits: `feat:`, `enhance:`, `fix:`, `security:`, `refactor:`, `docs:`, `chore:` …
- Nur `feat:`, `enhance:`, `fix:` und `security:` landen im Changelog — der Rest wird gefiltert
- Reines ESM, keine Transpilierung – Node.js 22 vorausgesetzt
- Neue Features als Issue anlegen, bevor die Implementierung beginnt

## Release-Workflow

Releases werden über Git-Tags und [`git-cliff`](https://git-cliff.org) verwaltet. Details: [`docs/git-workflow.md`](docs/git-workflow.md)

**Versionierung:**

| Typ | Version | Wann |
|---|---|---|
| Bug Fixes | x.x.**1** | Ein oder mehrere `fix:`-Commits seit letztem Release |
| Features & Enhancements | x.**1**.0 | Neue Funktionalität (`feat:` oder `enhance:`) |
| Breaking Changes | **x**.0.0 | Inkompatible Änderungen (DB-Schema, API, Konfiguration) |

**Ablauf (Patch-Beispiel):**

```bash
# 1. CHANGELOG-Entwurf generieren
git-cliff v3.0.0.. --unreleased --tag v3.0.1 --prepend CHANGELOG.md

# 2. Entwurf prüfen, ggf. anpassen
# 3. Committen und taggen
git add CHANGELOG.md
git commit -m "chore: release v3.0.1"
git tag v3.0.1
git push && git push --tags
```

## Issues

→ https://github.com/matthiasgruenwald/moo-gpt/issues

## Versionsverlauf

→ [CHANGELOG.md](CHANGELOG.md)
