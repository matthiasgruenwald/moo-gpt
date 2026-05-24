# Handoff: Wave 2 starten — #59 Werkzeug-Kosten

**Erstellt:** 2026-05-24  
**Fokus der nächsten Session:** Wave 2 — Backend-Integration (#63–#68)

---

## Projekt

moo-gpt — KI-Chatbot-Widget für Moodle (IGS Mittelstufe).  
Repo: `matthiasgruenwald/moo-gpt`, LXC-Pfad: `/opt/moo-gpt`, Dienst: `systemctl restart moo-gpt`.  
Stack: Node.js 22, Express, SQLite (better-sqlite3 sync), OpenAI Responses API.

---

## Was Wave 1 erledigt hat (✅ committed, deployed, HITL bestanden)

**Commit `ef82d55` + `35ffcf4`**

| Issue | Was | Neue Dateien/Änderungen |
|-------|-----|------------------------|
| #60 | `textCall`/`jsonCall` → `{text, usage}` | `ai-client.js` + alle 7 Aufrufer |
| #61 | DB-Migration: `token_log.call_type`, `activities.teacher_id/teacher_name` | `db.js` |
| #62 | `cost-service.js` mit 4 Export-Funktionen | `cost-service.js` (neu) |
| fix | SuggestPrompt timeout 60s → 120s | `routes/activity.js` |

Tests: 31/31 grün in `test/ai-client.test.js`, `test/db-migration.test.js`, `test/cost-service.test.js`, `test/prompt-check.test.js`.

---

## Wave 2 — Ziel

Alle KI-Werkzeug-Calls tatsächlich in `token_log` aufzeichnen + Teacher-Attribution beim Dashboard-Zugriff setzen. Nach Wave 2: Kosten sind in der DB, API-Endpunkte liefern sie aus.

**HITL nach Wave 2:** Werkzeuge im Dashboard aufrufen → `token_log` per SQL prüfen → API-Endpunkte per curl testen.

---

## Wave 2 Issues (Reihenfolge)

Die Handoff-Docs liegen unter `docs/plans/handoff-59-6X-*.md`. Hier nur die nicht-offensichtlichen Zusatzinfos:

### #63 — Teacher-Attribution beim Dashboard-Aufruf

→ `docs/plans/handoff-59-63-teacher-attribution.md`

**Nicht-offensichtlich:**
- `req.userId` wird von `requireDashboardAuth` automatisch gesetzt
- `req.userName` wird **nicht** automatisch gesetzt — muss manuell aus `getUserNameFromToken(req.query.token)` geholt werden (Export in `auth-middleware.js` Z.43)
- Das `UPDATE ... WHERE teacher_id IS NULL` läuft am besten in `stores/activity.js` als neue Funktion `setTeacherIfUnset(activityId, teacherId, teacherName)`
- Trigger: `GET /dashboard/students` (Z.20 in `routes/dashboard.js`) — das ist der erste Request beim Öffnen der Chatliste

### #64 — Live-Summary Cost Recording

→ `docs/plans/handoff-59-64-live-summary-cost.md`

**Nicht-offensichtlich:**
- Aufrufer: `routes/dashboard.js` Z.102 — bereits auf `{ text: summary }` umgestellt (Wave 1)
- `usage` liegt jetzt als zweites Destructuring-Feld vor: `const { text: summary, usage } = await ...`  
  → dann `recordWerkzeugUsage(activityId, 'live-summary', GEN_MODEL, usage)` aufrufen
- Response soll `{ summary, ..., cost }` bekommen — `cost` kommt von `recordWerkzeugUsage` nicht direkt; dafür `getCostSummary(activityId)` aufrufen oder Kosten inline berechnen (→ Wave 3 wird das im Frontend anzeigen)

### #65 — Prompt-Assistent Cost Recording

→ `docs/plans/handoff-59-65-prompt-assistent-cost.md`

**Nicht-offensichtlich:**
- `buildSuggestPromptHandler` in `routes/activity.js` Z.101: `textCall` gibt `{text, usage}` zurück — usage destructurieren und nach jedem Call aufzeichnen
- call_type: `'prompt-assist'`
- Der Handler hat **keinen direkten activityId-Zugriff** über `req.activityId` — check: kommt von `requireDashboardAuth` via `req.activityId`. Ja, steht in `auth-middleware.js` Z.49+.

### #66 — Criteria + Optimize + Persona Cost Recording

→ `docs/plans/handoff-59-66-criteria-optimize-persona-cost.md`

**Nicht-offensichtlich:**
- `criteria.js` und `optimize.js` sind reine Logik-Module (kein HTTP) — `activityId` muss als Parameter hineingegeben werden
- Die Caller (`routes/criteria.js`, `routes/erfahrungsprompt.js`) müssen `activityId` weitergeben und `recordWerkzeugUsage` aufrufen
- `routes/personas.js` Z.41: `{ text: result }` bereits Wave-1-ready — `usage` einfach dazunehmen

### #67 — Simulation Cost Recording

→ `docs/plans/handoff-59-67-simulation-cost.md`

**Nicht-offensichtlich:**
- `runSimulation` macht **mehrere** Teil-Calls (Utterances + Responses + Evaluierungen); User Story 7 sagt: **ein Eintrag** pro Durchlauf, Token akkumulieren
- `simulation.js` ist reines Logik-Modul — `activityId` + `recordWerkzeugUsage` müssen von außen hineingegeben oder vom Caller nach `runSimulation` aufgerufen werden
- Einfachste Lösung: `runSimulation` gibt `{ pairs, simResultsText, totalUsage }` zurück, der Route-Handler ruft `recordWerkzeugUsage` einmalig auf

### #68 — Neue Cost-API-Endpunkte

→ `docs/plans/handoff-59-68-cost-api-endpoints.md`

**Nicht-offensichtlich:**
- Alle drei Endpunkte nutzen fertige Funktionen aus `cost-service.js` (Wave 1)
- `GET /api/admin/costs` braucht `requireAdminAuth` (exportiert aus `auth-middleware.js`)
- Router-Zuordnung: neuer Router oder in bestehende `routes/` einbauen — Muster: `createActivityRouter` in `routes/activity.js`

---

## Wichtige Datei-Landkarte für Wave 2

| Datei | Relevanz |
|-------|---------|
| `cost-service.js` | `recordWerkzeugUsage`, `getCostSummary`, `getWerkzeugLog`, `getAdminCostsByTeacher` — fertig |
| `token-log.js` | `sumCostRows` (jetzt exportiert), `recordUsage` (für Chat-Calls, nicht anfassen) |
| `auth-middleware.js` | `getUserNameFromToken` (für #63), `requireAdminAuth` (für #68) |
| `stores/activity.js` | Neue Funktion `setTeacherIfUnset` hier anlegen (#63) |
| `routes/dashboard.js` | Live-Summary (#64), Teacher-Attribution (#63) |
| `routes/activity.js` | Prompt-Assistent (#65), bestehende `buildSuggestPromptHandler` |
| `routes/personas.js` | Persona-Suggest (#66) |
| `criteria.js` + `routes/criteria.js` | Kriterien-Generierung (#66) |
| `optimize.js` + `routes/erfahrungsprompt.js` | Optimierung (#66) |
| `simulation.js` + Route | Simulation (#67) |

---

## Nicht-offensichtliche Details aus Wave 1

- `textCall`/`jsonCall` geben jetzt `{text, usage}` zurück — überall konsequent per Destructuring holen: `const { text: result, usage } = await client.jsonCall(...)`
- `usage`-Objekt aus der OpenAI Responses API hat Felder `input_tokens`, `output_tokens` (nicht `prompt_tokens`/`completion_tokens`) — `recordWerkzeugUsage` erwartet dieses Format und mappt intern
- `stream()` gibt kein `usage` zurück — Chat-Calls bleiben weiterhin über `recordUsage` in `token-log.js` erfasst (unverändert)
- `call_type IS NULL` = Chat-Eintrag; alle Werkzeug-Queries filtern explizit — nie mischen

---

## Prozess für jede Wave-2-Aufgabe

1. Handoff-Doc lesen (`docs/plans/handoff-59-6X-*.md`)
2. `/karpathy-guidelines` aktivieren
3. Relevante Dateien lesen (nicht raten), alle Aufrufer grepen
4. `/tdd`: Test → Impl → Refactor
5. Am Ende Erkenntnisse als `gh issue comment` auf das Issue schreiben

**Empfohlene Reihenfolge:** #63 → #64 → #65 → #66 → #67 → #68 (Abhängigkeitsgraph: alle außer #68 unabhängig voneinander, #68 braucht alle anderen)
