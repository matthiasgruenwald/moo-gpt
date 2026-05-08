# mmbbs-gpt – CLAUDE.md

Kontext für Claude Code. Details in `docs/`.

---

## Projekt-Überblick

KI-Chatbot-Widget für Moodle (IGS Mittelstufe, v.a. Jg. 9). Floating-Chat-Widget per TinyMCE-Snippet. Lehrer-Dashboard mit Schüler-Chats, Token-Kosten, Session-Gruppen.

- **Live-URL:** https://gpt.gruenwald.fun
- **GitHub:** `matthiasgruenwald/mmbbs-gpt` (privat)
- **Version:** 3.0.0
- **Stack:** Node.js 22, Express, express-ws, OpenAI Responses API (gpt-5), openai SDK ≥6.35

---

## Infrastruktur

| | |
|---|---|
| Server | LXC 106 auf Proxmox |
| Pfad auf LXC | `/opt/mmbbs-gpt` |
| Dienst | `systemctl restart mmbbs-gpt` |
| Tunnel | Cloudflare → Port 3000 |
| Env-Datei | `/etc/mmbbs-gpt.env` |

---

## Wichtige Dateien

| Datei | Zweck |
|-------|-------|
| `server.js` | WebSocket-Server, OpenAI-Anbindung |
| `db.js` | SQLite-Modul |
| `public/mmbbs-bot.js` | Floating-Chat-Widget (ES-Modul) |
| `public/dashboard.html` / `dashboard.js` | Lehrer-Dashboard |
| `public/chat.html` | Standalone-Chat (iframe) |
| `snippets/abgpt.txt` | TinyMCE-Snippet Aufgaben |
| `snippets/tegpt.txt` | TinyMCE-Snippet Quiz/Test |

---

## Dokumentations-Index

| Datei | Inhalt |
|-------|--------|
| [`docs/db.md`](docs/db.md) | SQLite-Tabellen, db.js-Exports, better-sqlite3-Installation |
| [`docs/server.md`](docs/server.md) | server.js-Konzepte: Origin, Token-System, Responses API, Endpunkte |
| [`docs/bot.md`](docs/bot.md) | mmbbs-bot.js: Lazy-Init, Upload, Rollenerkennung, Cache |
| [`docs/dashboard.md`](docs/dashboard.md) | Layout, Session-Gruppen, Kostenanzeige, Token-Fehler |
| [`docs/snippets.md`](docs/snippets.md) | abgpt/tegpt TinyMCE-Snippets, Moodle-Rechte |
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
| Pfad | `/opt/mmbbs-gpt` |
| Dienst-Neustart | `systemctl restart mmbbs-gpt` |
| Logs | `journalctl -u mmbbs-gpt -f` |
| Env-Datei | `/etc/mmbbs-gpt.env` (nicht im Repo) |

Auf dem LXC arbeitet Claude Code direkt im Projektverzeichnis. `git push` vom LXC, Mac dient nur noch als Review/Merge-Station.

---

## Lokale Overrides

`CLAUDE.local.md` — für maschinenspezifische Ergänzungen (Mac-Pfade, lokale Tools, temporäre Hinweise). Diese Datei ist in `.gitignore` und wird **nie committet**.

Vorlage: `CLAUDE.local.example.md`

Auch ignoriert: `.claude/settings.local.json`, `.claude/local/`, `.claude/worktrees/`

---

## Git-Workflow (Kurzreferenz)

**WICHTIG: Git nie über Sandbox ausführen.** Fertigen Terminal-Block ausgeben, Matthias führt aus.

**LXC (primär):**
```bash
cd /opt/mmbbs-gpt
git add -p          # oder spezifische Dateien
git commit -m "feat: ..."
git push
systemctl restart mmbbs-gpt
```

**Mac → LXC Pull (nach Push vom Mac):**
```bash
cd /opt/mmbbs-gpt && git fetch origin '+refs/heads/*:refs/remotes/origin/*' && git pull origin BRANCH-NAME && systemctl restart mmbbs-gpt
```

Details: [`docs/git-workflow.md`](docs/git-workflow.md)

---

## Plan-Dateien

Projektbezogene Pläne gehören ins Repo unter `docs/plans/` (versioniert, auf LXC verfügbar).

**Nicht** mehr unter `~/.claude/plans/` — diese sind maschinenlokal und auf dem LXC nicht verfügbar.

Aktuelle Pläne: [`docs/plans/`](docs/plans/)