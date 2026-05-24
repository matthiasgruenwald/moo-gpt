# Handoff: Wave 3 starten — #59 Werkzeug-Kosten (Frontend)

**Erstellt:** 2026-05-24  
**Fokus der nächsten Session:** Wave 3 — Frontend-Integration (#69–#72)

---

## Projekt

moo-gpt — KI-Chatbot-Widget für Moodle (IGS Mittelstufe).  
Repo: `matthiasgruenwald/moo-gpt`, LXC-Pfad: `/opt/moo-gpt`, Dienst: `systemctl restart moo-gpt`.  
Stack: Node.js 22, Express, SQLite (better-sqlite3 sync), OpenAI Responses API.

---

## Was Wave 2 erledigt hat (✅ committed, deployed, HITL bestanden)

**Commit `91b00e5`** + Vorläufer `ea6a76c`

| Issue | Was | Neue/geänderte Dateien |
|-------|-----|------------------------|
| #63 | Teacher-Attribution im WS-Handler (`/api/dashboard-ws`) | `stores/activity.js`, `server.js`, `test/teacher-attribution.test.js` |
| #64 | Live-Summary cost recording | `routes/dashboard.js` |
| #65 | Prompt-Assistent cost recording | `routes/activity.js` |
| #66 | Criteria + Optimize + Persona cost recording | `criteria.js`, `optimize.js`, `routes/criteria.js`, `routes/erfahrungsprompt.js`, `routes/personas.js` |
| #67 | Simulation cost recording (Token akkumuliert) | `simulation.js`, `routes/simulation.js` |
| #68 | Neue Cost-API-Endpunkte | `routes/costs.js` (neu), `server.js` |

Tests: alle Wave-2-Tests grün (teacher-attribution, live-summary-cost, prompt-assist-cost, criteria-optimize-persona-cost, simulation-cost, cost-api).

**Wichtige Erkenntnis aus Wave 2 (nicht in Handoff-Docs):**  
`GET /dashboard/students` wird vom Dashboard **nicht genutzt** — das Dashboard kommuniziert ausschließlich über WebSocket `/api/dashboard-ws`. Teacher-Attribution musste deshalb in den WS-Handler (`server.js` Z.~242) statt in den REST-Endpoint.

---

## Verfügbare API-Endpunkte (für Wave 3 Frontend)

```
GET /api/activity/:activityId/cost-summary   requireDashboardAuth
→ { chatEur, werkzeugEur, totalEur }         (null wenn Preise fehlen)

GET /api/activity/:activityId/werkzeug-log   requireDashboardAuth
→ [{ id, createdAt, callType, callTypeLabel, model, promptTokens, completionTokens, totalTokens }]

GET /api/admin/costs                          requireAdminAuth
→ [{ teacherId, teacherName, activities: [{ activityId, activityName, chatEur, werkzeugEur, totalEur }] }]
```

Auth: Token als Query-Parameter `?token=...` (wie alle anderen Dashboard-Endpoints).

---

## Wave 3 — Ziel

Kosten im Frontend sichtbar machen. Nach Wave 3: Lehrkräfte sehen Kosten pro Aktivität, pro Werkzeug und in einer Admin-Gesamtübersicht.

**HITL nach Wave 3:** Werkzeuge nutzen → Kosten erscheinen in den Panels → Costs-Seite zeigt Summen.

---

## Wave 3 Issues (Reihenfolge)

Handoff-Docs liegen unter `docs/plans/handoff-59-6X-*.md`:

| Issue | Titel | Handoff-Doc |
|-------|-------|-------------|
| #69 | Kopfzeile Cost-Summary auf `/dashboard/chats` | `docs/plans/handoff-59-69-kopfzeile-cost-summary.md` |
| #70 | Inline-Kosten in Werkzeug-Panels | `docs/plans/handoff-59-70-inline-kosten-panels.md` |
| #71 | `/dashboard/costs` Seite — Nav-Tab + Werkzeug-Log | `docs/plans/handoff-59-71-costs-page-teacher.md` |
| #72 | Admin-Sektion auf `/dashboard/costs` | `docs/plans/handoff-59-72-costs-page-admin.md` |

**Reihenfolge:** #69 → #70 parallel zu #71 → #72 (braucht #71 fertig).

---

## Wichtige Nicht-Offensichtlichkeiten für Wave 3

1. **Frontend-Dateistruktur zuerst erkunden** — `docs/plans/handoff-59-69-kopfzeile-cost-summary.md` warnt explizit: Dateinamen in `public/` vor dem Start verifizieren (`ls public/`, `ls public/dashboard/`). Die Doku kann abweichen.

2. **Dashboard nutzt WebSocket, nicht REST** — initiale Schülerliste kommt über den `students`-WS-Event, nicht via HTTP. Für Cost-Summary wird jedoch der neue REST-Endpoint `GET /api/activity/:activityId/cost-summary` via fetch verwendet (kein WS nötig).

3. **`cost`-Felder in Werkzeug-Antworten** (aus Wave 2) — alle Werkzeuge geben jetzt `cost: { promptTokens, completionTokens }` in ihrer HTTP-Response zurück. Frontend kann Inline-Kosten daraus berechnen ohne Extra-Request. EUR-Betrag: nicht in `cost` direkt, aber `promptTokens`/`completionTokens` sind da.

4. **null-Handling** — `chatEur`, `werkzeugEur`, `totalEur` können `null` sein (wenn LiteLLM-Preisdaten fehlen). Frontend muss das abfangen — Anzeige ausblenden statt "null €" zeigen.

5. **callTypeLabel** — `getWerkzeugLog` liefert bereits die deutschen Labels (`Simulation`, `Kriterien`, `Live-Zusammenfassung` etc.). Frontend muss nicht selbst mappen.

---

## Prozess für jede Wave-3-Aufgabe

1. Handoff-Doc lesen (`docs/plans/handoff-59-6X-*.md`)
2. `/karpathy-guidelines` aktivieren
3. Relevante Frontend-Dateien lesen (nicht raten), `ls public/` erkunden
4. Änderung implementieren + manueller Smoke-Test
5. Issue-Kommentar mit Erkenntnissen

Skills: `/karpathy-guidelines` + ggf. `/tdd` für JS-Logik-Tests.
