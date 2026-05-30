# moo-gpt – CLAUDE.md

KI-Chatbot-Widget für Moodle (IGS Mittelstufe, v.a. Jg. 9). Floating-Chat-Widget per TinyMCE-Snippet. Lehrer-Dashboard mit Schüler-Chats, Token-Kosten, Session-Gruppen.

- **Live-URL:** https://gpt.gruenwald.fun
- **GitHub:** `matthiasgruenwald/moo-gpt` (privat)

---

## Infrastruktur

| | |
|---|---|
| Laptop-Pfad | `/Users/mg/Documents/Claude/Projects/Moodle/moo-gpt` |
| LXC-Pfad | `/opt/moo-gpt` |
| Dienst | `systemctl restart moo-gpt` |
| Tunnel | Cloudflare → Port 3000 |
| Env-Datei | `/etc/moo-gpt.env` (nicht im Repo) |

Entwicklung primär auf LXC. Mac als Review/Merge-Station.

**Git/gh-Befehle nur ausführen, wenn Matthias explizit dazu auffordert.** Sonst Terminal-Block ausgeben.
Git-Workflow-Details: [`docs/git-workflow.md`](docs/git-workflow.md)

**STOPP vor `gh release create`:** CHANGELOG.md mit Matthias zusammen manuell prüfen — git-cliff-Ausgabe kontrollieren, Version bestätigen, erst dann Release erstellen.

---

## Nicht-offensichtliche Dateien

| Datei | Zweck |
|-------|-------|
| `env-config.js` | `MODEL_NAME` ≠ `GEN_MODEL` — verschiedene Dinge |
| `stores/prompt.js` | cachedConfig-Singleton (System-Prompt + Modell) — wird von fast allen Routes importiert |
| `simulation.js` | `runSimulation`: kein HTTP-Endpunkt |
| `criteria.js` | `suggestCriteriaList`, `augmentCriteria`: kein HTTP, reine Logik |
| `optimize.js` | `generateOptimizeProposal`: kein HTTP |
| `lock-manager.js` | Aktivitätssperren (Map + Timer + Broadcast) |
| `prompt-builder.js` | `buildInstructions`: System-Prompt aus Teilen zusammensetzen |
| `validators.js` | `validateWidgetConfig`: Domain-Validierung, ≠ route-Validators |
| `routes/erfahrungsprompt.js` | Erfahrungsprompt CRUD + `/optimize-prompt` |

---

## Aufgabenhandling

Before editing any file, read it first. Before modifying a function, grep for all callers.

Pläne gehören nach `docs/plans/` (versioniert, auf LXC verfügbar — nicht `~/.claude/plans/`).

---

## Agent Skills

Issues: GitHub Issues (`matthiasgruenwald/moo-gpt`) via `gh` CLI. Details: `docs/agents/issue-tracker.md`.

Triage-Labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Details: `docs/agents/triage-labels.md`.

Single-context repo: `CONTEXT.md` im Root, `docs/adr/` für Architekturentscheidungen (lazily created).
