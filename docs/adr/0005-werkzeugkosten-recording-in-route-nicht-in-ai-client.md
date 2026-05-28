# ADR 0005 — Werkzeugkosten werden explizit in der Route erfasst, nicht in AIClient

**Status:** Akzeptiert  
**Datum:** 2026-05-28

---

## Kontext

Jeder Werkzeug-Aufruf (Kriterien, Personas, Optimierung, Prompt-Assistent, Live-Zusammenfassung, Simulation) erzeugt Kosten, die in `token_log` erfasst werden müssen (`recordWerkzeugUsage()`). Die Frage: Soll die Erfassung automatisch in `AIClient.textCall()` / `jsonCall()` passieren, oder explizit in jeder Route?

Bestand zum Entscheidungszeitpunkt: 7 Callsites in Routes (criteria, personas, erfahrungsprompt, activity/prompt-assist, dashboard/live-summary, simulation) + 1 Callsite intern in `simulation.js` (komplexe Aggregation).

---

## Entscheidung

`recordWerkzeugUsage()` wird **explizit in der Route** aufgerufen, unmittelbar nach dem AI-Call. `AIClient` bleibt frei von DB-Seiteneffekten.

**Ausnahme:** `simulation.js` erfasst intern, weil es viele Teil-Calls aggregiert und das Usage-Objekt erst am Ende des Orchestrierungslaufs vollständig ist.

**Konvention:**
```
Route: AI-Call → recordWerkzeugUsage(activityId, callType, model, usage)
Modul mit Aggregation (z.B. simulation.js): erfasst intern
Chat-Response: nutzt saveTokenUsage() aus stores/token.js — KEIN recordWerkzeugUsage
```

---

## Begründung

**AIClient-Reinheit:** `AIClient` ist ein HTTP-Wrapper um die OpenAI Responses API mit Retry-Logik und Timeout. Das Einbetten von DB-Zugriffen würde AIClient von `db.js` / `cost-service.js` abhängig machen — ein Kreuz-Dependency von Infrastruktur in einen Low-Level-Wrapper.

**Simulation-Problem:** `simulation.js` aggregiert mehrere Teil-Calls (Äußerungen generieren + Antwort + Evaluierung) zu einem Usage-Objekt. Würde AIClient automatisch pro Call erfassen, entstünden mehrere Werkzeug-Einträge pro Simulations-Durchlauf — laut CONTEXT.md soll es genau einer sein.

**Auditierbarkeit:** `grep -r 'recordWerkzeugUsage' routes/` zeigt sofort alle Erfassungsstellen. Implizites Recording in AIClient macht das unsichtbar.

---

## Alternativen verworfen

**Automatisches Recording in AIClient:** Würde AIClient von `cost-service.js` abhängig machen und das Simulation-Aggregations-Problem erzeugen.

**WerkzeugClient-Wrapper:** Thin Wrapper um AIClient der `activityId` + `callType` trägt. Unnötige Indirektion für 7 Callsites; erschwerend: model kommt aus unterschiedlichen Quellen je Route.

---

## Konsequenzen

- Jede neue Route mit AI-Call MUSS unmittelbar nach dem Call `recordWerkzeugUsage()` aufrufen (wenn `activityId` vorhanden).
- `AIClient` bleibt frei von DB-Importen.
- Bei Audit: `grep -rn 'recordWerkzeugUsage' routes/` zeigt vollständigen Überblick.
