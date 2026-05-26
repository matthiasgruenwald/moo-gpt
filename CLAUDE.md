# moo-gpt – CLAUDE.md

Kontext für Claude Code. Details in `docs/`.

---

## Projekt-Überblick

KI-Chatbot-Widget für Moodle (IGS Mittelstufe, v.a. Jg. 9). Floating-Chat-Widget per TinyMCE-Snippet. Lehrer-Dashboard mit Schüler-Chats, Token-Kosten, Session-Gruppen.

- **Live-URL:** https://gpt.gruenwald.fun
- **GitHub:** `matthiasgruenwald/moo-gpt` (privat)
- **Version:** 3.0.0
- **Stack:** Node.js 22, Express, express-ws, OpenAI Responses API (gpt-5), openai SDK ≥6.35

---

## Infrastruktur

| | |
|---|---|
| Server | LXC 106 auf Proxmox |
| Pfad auf LXC | `/opt/moo-gpt` |
| Dienst | `systemctl restart moo-gpt` |
| Tunnel | Cloudflare → Port 3000 |
| Env-Datei | `/etc/moo-gpt.env` |

---

## Nicht-offensichtliche Dateien

| Datei | Zweck |
|-------|-------|
| `config-cache.js` | Singleton für cachedConfig (System-Prompt + Modell) — wird von fast allen Routes importiert |
| `ai-instance.js` | oai + aiClient Singletons, APIKEY-Guard beim Start |
| `env-config.js` | Berechnete Env-Konstanten — MODEL_NAME vs. GEN_MODEL sind verschiedene Dinge |
| `ai-client.js` | AIClient-Wrapper: textCall, jsonCall (konfig. Timeout), Streaming |
| `simulation.js` | runSimulation: Äußerungen generieren → KI-Antwort → Evaluierung (kein HTTP) |
| `criteria.js` | suggestCriteriaList, augmentCriteria (kein HTTP, reine Logik) |
| `optimize.js` | generateOptimizeProposal: neuen Erfahrungsprompt-Vorschlag erzeugen |
| `persona-selector.js` | selectPersonasForOneClick: Heuristik welche Personas für One-Click-Optimierung |
| `lock-manager.js` | LockManager: Aktivitätssperren (Map + Timer + Broadcast) |
| `prompt-builder.js` | buildInstructions: System-Prompt aus Teilen zusammensetzen |
| `validators.js` | validateWidgetConfig — Domain-Validierung, kein HTTP-Bezug (≠ route-Validators) |
| `routes/activity.js` | createActivityRouter: activity-config + activity-lock Endpoints |
| `routes/admin.js` | createAdminRouter: System-Prompt, History, Template, Logs, Neustart |
| `routes/erfahrungsprompt.js` | Erfahrungsprompt CRUD + /optimize-prompt Endpoint |
| `routes/criteria.js` | createCriteriaRouter: Kriterien, Erkenntnisse, Feedback-Bewertung |
| `snippets/moo-gpt.txt` | TinyMCE-Snippet für Moodle-Aufgaben |

---

## Dokumentations-Index

| Datei | Inhalt |
|-------|--------|
| [`docs/db.md`](docs/db.md) | SQLite-Tabellen, db.js-Exports, better-sqlite3-Installation |
| [`docs/server.md`](docs/server.md) | server.js-Konzepte: Origin, Token-System, Responses API, Endpunkte |
| [`docs/bot.md`](docs/bot.md) | moo-bot.js: Lazy-Init, Upload, Rollenerkennung, Cache |
| [`docs/dashboard.md`](docs/dashboard.md) | Layout, Session-Gruppen, Kostenanzeige, Token-Fehler |
| [`docs/snippets.md`](docs/snippets.md) | moo-gpt TinyMCE-Snippet, Moodle-Rechte |
| [`docs/system-prompt.md`](docs/system-prompt.md) | Aktueller System-Prompt, Bildverarbeitung |
| [`docs/git-workflow.md`](docs/git-workflow.md) | Mac- und LXC-Blöcke, grep-Hinweis |
| [`docs/github-issues.md`](docs/github-issues.md) | curl-Befehle für Issues anlegen/schließen/listen |
| [`docs/gotchas.md`](docs/gotchas.md) | Bekannte Stolpersteine (UTC, token_log, Safari-Cache, …) |

---

## Offene Issues

| # | Titel |
|---|-------|
| #6 | Chat-Verwaltung: Neue Chats, Archivierung & sicheres Löschen |
| #7 | Rollenerkennung für tegpt (iframe) |
| #9 | Feature: Snippet für Lehrer-Übersicht über mehrere Aktivitäten |

---

## Deployment-Hinweis

Matthias deployt auf dem LXC selbst. Keine Deployment-Snippets ausgeben außer wenn explizit gefragt. Ausnahme: Git-Befehle für Branch-Wechsel oder Fetch.

## Aufgabenhandling

Before editing any file, read it first. Before modifying a function, grep for all callers. Research before you edit.
Wenn eine Aufgabe einen Spezialisten erfordert, schaue in docs/skills-index.md nach und aktiviere den passenden Agenten temporär.

---

## Entwicklung auf dem LXC

Entwicklung findet primär direkt auf dem LXC statt (nicht mehr auf dem Mac mit anschließendem Deploy).

| | |
|---|---|
| Pfad | `/opt/moo-gpt` |
| Dienst-Neustart | `systemctl restart moo-gpt` |
| Logs | `journalctl -u moo-gpt -f` |
| Env-Datei | `/etc/moo-gpt.env` (nicht im Repo) |

Auf dem LXC arbeitet Claude Code direkt im Projektverzeichnis. `git push` vom LXC, Mac dient nur noch als Review/Merge-Station.

---

## Lokale Overrides

`CLAUDE.local.md` — für maschinenspezifische Ergänzungen (Mac-Pfade, lokale Tools, temporäre Hinweise). Diese Datei ist in `.gitignore` und wird **nie committet**.

Vorlage: `CLAUDE.local.example.md`

Auch ignoriert: `.claude/settings.local.json`, `.claude/local/`, `.claude/worktrees/`

---

## Git-Workflow (Kurzreferenz)

**Git/gh-Befehle nur ausführen, wenn Matthias in der laufenden Session explizit dazu auffordert.** Sonst immer einen fertigen Terminal-Block ausgeben.

**LXC (primär):**
```bash
cd /opt/moo-gpt
git add -p          # oder spezifische Dateien
git commit -m "feat: ..."
git push
systemctl restart moo-gpt
```

**Mac → LXC Pull (nach Push vom Mac):**
```bash
cd /opt/moo-gpt && git fetch origin '+refs/heads/*:refs/remotes/origin/*' && git pull origin BRANCH-NAME && systemctl restart moo-gpt
```

Details: [`docs/git-workflow.md`](docs/git-workflow.md)

---

## Plan-Dateien

Projektbezogene Pläne gehören ins Repo unter `docs/plans/` (versioniert, auf LXC verfügbar).

**Nicht** mehr unter `~/.claude/plans/` — diese sind maschinenlokal und auf dem LXC nicht verfügbar.

Aktuelle Pläne: [`docs/plans/`](docs/plans/)

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`matthiasgruenwald/moo-gpt`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard five-role vocabulary with default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` at the root, `docs/adr/` for architectural decisions (created lazily). See `docs/agents/domain.md`.