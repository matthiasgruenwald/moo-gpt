# Architektur-Review 2026-05-23
## Ergebnis: Deepening Opportunities (für spätere grill-with-docs Session)

Erstellt aus `/improve-codebase-architecture`-Session. Noch nicht priorisiert oder geplant —
Matthias möchte das zu einem späteren Zeitpunkt vertiefen.

---

## Hintergrund

Kein `CONTEXT.md`, kein `docs/adr/` vorhanden. Die fehlende Domain-Dokumentation
verstärkt die Unklarheiten im Code. Empfehlung: `CONTEXT.md` zuerst anlegen, dann
Kandidaten angehen.

---

## Domain-Unklarheiten (für grill-with-docs)

| Konzept | Unklarheit |
|---|---|
| **Erkenntnisse / Kriterien** | Sind das dasselbe? Unterschiedliche `source`-Werte in derselben DB-Tabelle (`criteria`, `ai`). |
| **Erfahrungsprompt** | Was ist der Unterschied zum System-Prompt? Wann wird welcher verwendet? |
| **Aktivität** | Entspricht 1:1 einer Moodle-Aktivität? Kann eine Aktivität mehrere Chats haben? |
| **Session** | Ist eine Session = ein Schüler-Tab, oder pro-Schüler-pro-Aktivität? |
| **Modell** | `MODEL_NAME` vs `GEN_MODEL` — warum zwei? Wann gilt welches? |
| **Lehrer-Präferenz** | Kann ein Lehrer das Modell pro-Aktivität wählen, oder nur global? |

---

## Deepening Candidates (nummeriert)

### 1. `streamResponse()` in server.js — fehlendes Modul ★★★
**Files:** `server.js` (Z. 362–431), `prompt-builder.js`, `ai-client.js`, `stores/chat.js`

**Problem:** Die kritischste Funktion (Streaming-Antwort an Schüler) lebt in `server.js`
zwischen Express-Setup und Route-Registrierung. Orchestriert prompt-building, AI-Call,
DB-Schreiben, Dashboard-Broadcast, Kostenzuordnung — ohne eigenes Modul.

**Solution:** Extraktion zu `services/chat-response.js`.
Seam: `streamResponse(session, config)` → event stream.

**Benefits:** Testbar ohne HTTP-Server; `simulation.js` kann denselben Kern nutzen.

---

### 2. Dreifacher Konfig-Zustand ohne klare Quelle der Wahrheit ★★★
**Files:** `config-cache.js`, `env-config.js`, `stores/prompt.js`, `server.js` (Z. 169–180)

**Problem:** System-Prompt und Modell aus drei Quellen (Env, DB, In-Memory-Cache),
manuell in `server.js` synchronisiert beim Start. Potenzielle Race Condition.

**Solution:** `ConfigService` mit `init()`, `get()`, `update()`.

**Benefits:** Kein manueller Boot-Code in server.js; testbar.

---

### 3. `aiClient` direkt importiert in 10+ Modulen — kein echter Seam ★★★
**Files:** `ai-instance.js`, `routes/activity.js`, `routes/criteria.js`, `routes/dashboard.js`,
`routes/simulation.js`, `routes/personas.js`, `criteria.js`, `optimize.js`, `simulation.js`

**Problem:** Globaler Singleton, überall direkt importiert. Kein Seam für Tests.

**Solution:** Dependency Injection: Route-Factories und Services nehmen `aiClient` als Parameter.

**Benefits:** Echter Seam (zwei Adapter → real seam). Testbarkeit ohne OpenAI-Calls.

---

### 4. Erkenntnisse ≠ Kriterien — semantische Unklarheit ohne CONTEXT.md ★★
**Files:** `criteria.js`, `routes/criteria.js`, `stores/criteria.js`, `optimize.js`, DB-Tabelle `erkenntnisse`

**Problem:** DB-Tabelle heißt `erkenntnisse`, Code-Begriff `criteria`, Route `/criteria`,
`source`-Werte `'criteria'` vs `'ai'` vs implizit Feedback — kein Dokument definiert den Unterschied.

**Solution:** `CONTEXT.md` anlegen mit expliziten Definitionen.

**Benefits:** AI-Navigierbarkeit; verhindert falsche Tabellenzugriffe.

---

### 5. `token-log.js` — Modul-Level-Seiteneffekte und gemischte Sync/Async-APIs ★★
**Files:** `token-log.js`

**Problem:** `setInterval` im Modul-Scope (Pricing-Fetch alle 24h, EUR alle 1h).
`computeRunCost()` sync, `computeRunCostForModel()` async — für Caller undurchsichtig.
Stiller Fallback auf `null` wenn Pricing noch nicht geladen.

**Solution:** `CostService` mit explizitem `init()`.

**Benefits:** Kontrollierter Start; testbar; keine stillen Null-Kosten.

---

### 6. `routes/student-memory.js` — Dual-Auth inline, kein Middleware-Seam ★
**Files:** `routes/student-memory.js`

**Problem:** Verzweigt intern zwischen Schüler-Auth und Lehrer-Auth,
indem `requireDashboardAuth` als Callback im Handler aufgerufen wird.
Jeder andere Route nutzt Top-Level-Middleware.

**Solution:** Gemeinsamer Auth-Middleware für gemischte Auth-Kontexte.

---

### 7. `getMessages()` vs `getMessagesAll()` — zwei Funktionen ohne erklärten Unterschied ★
**Files:** `stores/chat.js`

**Problem:** Unterschiedliches Verhalten (task_image ein-/ausschließen, LEFT JOIN mit Edits)
ohne erklärenden Kommentar. Caller müssen beide Queries verstehen.

**Solution:** Eine Funktion mit expliziten Filterparametern oder erklärender Kommentar.

---

### 8. `server.js` als 436-Zeilen-Monolith ★
**Files:** `server.js`

**Problem:** Express-Setup, Rate-Limiting, Origin-Checking, Registry-Init, Config-Init,
Route-Registrierung, Model-Selection, `streamResponse()` — alles in einer Datei.

**Note:** Kommt großteils von selbst durch Kandidaten 1 + 2.

---

## Prioritäts-Empfehlung

1. Zuerst: `CONTEXT.md` anlegen (löst Kandidat 4, erleichtert alle anderen)
2. Dann: Kandidaten 1–3 (höchste Testbarkeits-Dividende)
3. Danach: 5–8 nach Bedarf

---

## Zugehörige Pläne
- Nächster Schritt: grill-with-docs Session für CONTEXT.md + Domain-Definitionen
