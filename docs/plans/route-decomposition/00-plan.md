# Plan: Route-Dekomposition server.js

**Ziel:** `server.js` von 1.129 auf ~280 Zeilen schrumpfen.  
32 HTTP-Route-Handler in 8 domänenspezifische Router-Module extrahieren.  
3 neue Infrastruktur-Module für geteilten State und Konstanten.

---

## Motivation

`server.js` ist ein Landfill: Express-Bootstrap, WebSocket-Middleware, Rate-Limiting
und 32 HTTP-Handler aus 8 verschiedenen Domänen koexistieren in einer Datei.
Einen neuen Endpunkt hinzufügen bedeutet 1100 Zeilen durchqueren.
Lokalisierung von Bugs erfordert Kenntnis des gesamten globalen Scope.

Nach der Dekomposition ist jede Domäne in sich geschlossen. `server.js` wird
zum reinen Orchestrator: Setup, WebSocket-Handler, Route-Mounting.

---

## Neue Dateien (Übersicht)

### Infrastruktur-Module

| Datei | Zweck |
|-------|-------|
| `config-cache.js` | Mutabler cachedConfig-State (System-Prompt + Modell) |
| `ai-instance.js` | aiClient + oai Singletons, APIKEY-Guard |
| `env-config.js` | Berechnete Env-Konstanten (AVAILABLE_MODELS, GEN_MODEL, …) |

### Route-Module

| Datei | Endpunkte | Interface |
|-------|-----------|-----------|
| `routes/validators.js` | — | Shared Validierungs-Hilfsfunktion |
| `routes/activity.js` | 4 | Factory `createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks })` |
| `routes/dashboard.js` | 2 | Plain Router |
| `routes/admin.js` | 12 | Plain Router |
| `routes/teacher.js` | 7 | Plain Router |
| `routes/erfahrungsprompt.js` | 5 | Plain Router |
| `routes/personas.js` | 7 | Plain Router |
| `routes/criteria.js` | 8 | Plain Router |
| `routes/simulation.js` | 2 | Plain Router |

---

## Umsetzungs-Schritte

Jeder Schritt ist atomar: Datei erstellen → in `server.js` einbinden →
Server neu starten → Smoke-Test → commit.

### ~~Schritt 1 — Infrastruktur-Module erstellen~~ ✓
**Datei:** `01-infra-modules.md`

`config-cache.js`, `ai-instance.js`, `env-config.js` erstellt.
In `server.js` eingebunden. Smoke-Test bestanden.

### ~~Schritt 2 — Validators extrahieren~~ ✓
**Datei:** `02-validators.md`

`routes/validators.js` mit `validateTemplateFields()` + Konstanten.
In `server.js` importieren und lokale Definition löschen. Smoke-Test bestanden.

### Schritt 3 — Activity-Router extrahieren
**Datei:** `03-routes-activity.md`

`routes/activity.js` mit 4 Endpunkten (activity-config, plenum-lock).
Factory-Pattern wegen `chatRegistry`, `dashboardRegistry`, `activityLocks`.

### Schritt 4 — Dashboard-Router extrahieren
**Datei:** `04-routes-dashboard.md`

`routes/dashboard.js` mit 2 HTTP-Endpunkten (students, messages).
`enrichStudentsWithCost` zieht hier rein.

### Schritt 5 — Admin-Router extrahieren
**Datei:** `05-routes-admin.md`

`routes/admin.js` mit 12 Endpunkten.
Liest und schreibt `cachedConfig` via `config-cache.js`.

### Schritt 6 — Teacher-Router extrahieren
**Datei:** `06-routes-teacher.md`

`routes/teacher.js` mit 7 Endpunkten (preferences, templates, system-template).

### Schritt 7 — Erfahrungsprompt-Router extrahieren
**Datei:** `07-routes-erfahrungsprompt.md`

`routes/erfahrungsprompt.js` mit 5 Endpunkten inkl. optimize-prompt.

### Schritt 8 — Personas-Router extrahieren
**Datei:** `08-routes-personas.md`

`routes/personas.js` mit 7 Endpunkten (Lehrer + Admin-Personas + suggest).

### Schritt 9 — Criteria-Router extrahieren
**Datei:** `09-routes-criteria.md`

`routes/criteria.js` mit 8 Endpunkten (criteria CRUD, erkenntnisse, feedback).

### Schritt 10 — Simulation-Router extrahieren
**Datei:** `10-routes-simulation.md`

`routes/simulation.js` mit 2 SSE-Endpunkten.
`selectPersonasForOneClick()` zieht hier rein.

### Schritt 11 — server.js aufräumen
**Datei:** `11-server-cleanup.md`

Alle verbleibenden toten Imports und Definitionen entfernen.
Ergebnis: ~280 Zeilen reiner Orchestrator.

---

## Was in server.js bleibt (nach allen Schritten)

- Express + SSL-Setup
- `expressWs`-Setup
- `dashboardRegistry`, `chatRegistry` (ClientRegistry-Instanzen)
- `activityLocks` (Map)
- `limitRequests`, `checkOrigin`, `checkFormat` Middleware
- `getEffectiveModel()` (nur von `streamResponse` genutzt)
- `buildInput()` (nur von `streamResponse` genutzt)
- `streamResponse()` (WebSocket-Kontext, Globals-abhängig)
- `app.ws('/api/dashboard-ws', ...)` WebSocket-Handler
- `app.ws('/api/chat', ...)` WebSocket-Handler
- Route-Mounting (`app.use(...)`)
- DB-Init, Admin-Seeding, Prompt-Migration
- `server.listen()`

---

## Smoke-Test nach jedem Schritt

```bash
systemctl restart moo-gpt
journalctl -u moo-gpt -n 20 --no-pager
# Erwartung: "Server is running on port 3000" ohne Fehler
```

Dann im Browser:
- Chat-Widget öffnen (WebSocket)
- Dashboard öffnen (Token-Auth)
- Einen der neu extrahierten Endpunkte manuell aufrufen
