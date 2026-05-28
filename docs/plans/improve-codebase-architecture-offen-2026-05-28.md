# Offene Architektur-Verbesserungen (zurückgestellt 2026-05-28)

Entstanden aus der `/improve-codebase-architecture`-Session. Punkte 1–3 wurden in derselben Session umgesetzt.
Diese vier Punkte werden bewusst zurückgestellt — kein unmittelbarer Handlungsbedarf.

---

## Punkt 4 — `config-cache.js` ist ein Phantom-Modul

**Problem:** `config-cache.js` exportiert nur `getCachedConfig()` / `updateCachedConfig()` über eine einfache In-Memory-Variable. Deletion-Test: wenn man das Modul löscht, wandert die Logik in `stores/prompt.js` + `app-init.js` — das wäre konzentrierter.

**Betroffene Dateien:** `config-cache.js`, `stores/prompt.js`, `app-init.js`, `services/chat-response.js`, `model-resolver.js`, `routes/activity.js`, `routes/criteria.js`, `routes/erfahrungsprompt.js`

**Vorschlag:** `stores/prompt.js` hält den Cache intern. `getActiveSystemPrompt()` hat einen optionalen In-Memory-Cache; `updateCachedConfig()` wird zu einem internen Update-Aufruf. Die 6+ Caller würden `getActiveSystemPrompt()` aus `stores/prompt.js` importieren statt `getCachedConfig()` aus `config-cache.js`.

**Aufwand:** Mittel. Berührt viele Dateien, aber das Muster ist klar.

**Voraussetzung:** Kein laufendes Feature-Issue. Kann isoliert als Refactoring-Issue erfasst werden.

---

## Punkt 5 — Token-Authentifizierung verliert Zustand bei Neustart

**Problem:** `auth-middleware.js` speichert Dashboard-Tokens in einer In-Process-`Map`. Server-Neustart = alle Lehrer-Sessions ungültig (müssen erneut Token anfordern). Für eine einzelne Instanz akzeptabel, aber ein Blocker für:
- Horizontale Skalierung (mehrere Node-Prozesse)
- Zero-Downtime-Deployments
- Moodle-Plugin (nginx + mehrere Workers)

**Vorschlag:** SQLite-backed Token-Store (neue Tabelle `dashboard_tokens`, TTL-Cleanup via DB-Trigger oder Cron). Alternativ: signierte JWTs ohne Server-State.

**Aufwand:** Hoch. Berührt auth-middleware.js, muss backward-kompatibel bleiben.

**Empfehlung:** Erst angehen wenn Plugin-Umbau konkret wird oder Neustart-Probleme im Unterricht auftreten.

---

## Punkt 6 — `overview-summary` AI-Call direkt in `routes/dashboard.js`

**Problem:** Der Live-Unterrichts-Überblick (PRD-5, CONTEXT.md: „Live-Unterrichts-Überblick") baut seinen AI-Call inline in der Route zusammen. Das ist Geschäftslogik im HTTP-Layer — analog zu dem, was mit `simulation.js` bereits gelöst wurde.

**Betroffene Dateien:** `routes/dashboard.js` (Zeile ~90–105)

**Vorschlag:** `services/live-summary.js` extrahieren:
```js
export async function generateLiveSummary({ activityId, aiClient, model }) {
  // Chats laden, prompt bauen, aiClient.textCall, usage zurückgeben
}
```
Route delegiert dorthin, `recordWerkzeugUsage` verbleibt in der Route (ADR 0005).

**Aufwand:** Gering. Klare Extraktion, gut testbar.

**Empfehlung:** Sinnvoll wenn PRD-5 (Live-Unterrichts-Überblick) weiterentwickelt wird.

---

## Punkt 7 — Test-Coverage-Lücken bei Kernrouten

**Keine Tests für:**
- `routes/admin.js` (System-Prompt-History, Git-Sync, Admin-Liste)
- `routes/personas.js` (Persona CRUD, Persona-Generator AI)
- `routes/erfahrungsprompt.js` (Prompt-CRUD, optimize-proposal)
- `routes/criteria.js` (Kriterien CRUD, suggest)
- `lock-manager.js`
- `client-registry.js`

**Priorisierung:**
1. `routes/criteria.js` — häufig genutzt, keine Tests
2. `routes/erfahrungsprompt.js` — Versionshistorie-Logik fehlt
3. `lock-manager.js` — einfach zu testen, direkte Relevanz für Plenums-Feature

**Aufwand:** Mittel je Datei. Kein Umbau nötig — DI-Pattern ist überall vorhanden.

---

## Verweise

- Roadmap: `docs/plans/roadmap-2026-5.md`
- Nächste Feature-Phase: `docs/plans/handoff-129-naechste-schritte.md`
- ADR 0005 (recordWerkzeugUsage-Konvention): `docs/adr/0005-werkzeugkosten-recording-in-route-nicht-in-ai-client.md`
