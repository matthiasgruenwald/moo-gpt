# Handoff #128 — Dashboard-Schülerkosten Seam reparieren

**GitHub Issue:** #128  
**Label:** ready-for-agent  
**Blocked by:** — (unabhängig; #125-Restarbeiten sind bereits im Working Tree)  
**Ziel:** `enrichStudentsWithCost` an einem Ort (`stores/dashboard.js`), Duplikation weg, Zirkelabhängigkeit zu `ai-instance.js` eliminiert.

---

## Einstieg für neue Session

```
/karpathy-guidelines
/tdd
```

---

## Ist-Zustand (verifiziert 2026-05-27)

### Uncommitted Working-Tree-Änderungen

Achtung: Es gibt **pre-existing unstaged Änderungen** aus #125-Vorarbeiten:

| Datei | Status | Inhalt |
|-------|--------|--------|
| `cost-service.js` | staged (M·) | Neue Exports: `computeThreadCost`, `computeActivityCost`, `sumCostRows`, `enrichMessagesWithCost` u.a. |
| `routes/dashboard.js` | unstaged (·M) | Import von `computeThreadCost, sumCostRows` jetzt aus `cost-service.js` statt `token-log.js` |
| `routes/dashboard-ws.js` | unstaged (·M) | Import von `computeActivityCost, computeThreadCost` jetzt aus `cost-service.js` statt `token-log.js` |
| `token-log.js` | unstaged (·M) | Kosten-Funktionen entfernt/verschoben |
| `test/cost-service.test.js` | unstaged (·M) | Neue Tests — **5 davon schlagen aktuell fehl** (`getWerkzeugLog`, `getAdminCostsByTeacher`) |

Die fehlschlagenden Tests testen Funktionen, die noch nicht oder anders in `cost-service.js` existieren. Das muss in dieser Session mitbereinigt werden **oder** gezielt übersprungen werden — aber nicht ignoriert.

### `enrichStudentsWithCost` — das eigentliche #128-Problem

**`routes/dashboard.js`** (Zeilen 12–17, unstaged geändert aber Export noch drin):
```js
// Issue #41: Kosten pro Schüler aus per-Modell-Token-Daten berechnen
export async function enrichStudentsWithCost(students) {
  return Promise.all(students.map(async s => ({
    ...s,
    threadCost: await computeThreadCost(s.thread_db_id),
  })));
}
```
→ `computeThreadCost` kommt jetzt schon aus `cost-service.js` (unstaged).

**`routes/dashboard-ws.js`** (Zeilen 27–35, unstaged):
```js
// Inline-Kopie von routes/dashboard.js#enrichStudentsWithCost — vermeidet
// einen Transitivimport von ai-instance.js (über routes/dashboard.js) der
// beim Testen ohne APIKEY-Env den Prozess beendet.
async function enrichStudentsWithCost(students) {
  return Promise.all(students.map(async s => ({
    ...s,
    threadCost: await computeThreadCost(s.thread_db_id),
  })));
}
```
→ ebenfalls bereits auf `cost-service.js` umgestellt (unstaged).

**`stores/dashboard.js`** (17 Zeilen): exportiert nur `getStudents`, **kein** `enrichStudentsWithCost`.

### `routes/dashboard-ws.js` — Dependency-Injection-Muster

Der Handler wird über `createDashboardWsHandler(deps)` aufgebaut. `enrichStudentsWithCost` wird als `deps.enrichStudentsWithCost` injiziert. In `createDashboardWsRouter` werden alle Deps übergeben, darunter die lokale Funktion:

```js
const handler = createDashboardWsHandler({
  ...
  enrichStudentsWithCost,   // ← aktuell lokale Kopie
  ...
});
```

Nach dem Refactoring kommt `enrichStudentsWithCost` von `stores/dashboard.js`.

`test/dashboard-ws.test.js` **existiert bereits** und nutzt das DI-Muster — Tests sind grün.

---

## Zielzustand

### `stores/dashboard.js` — neuer Export

```js
import { computeThreadCost } from '../cost-service.js';

export async function enrichStudentsWithCost(students) {
  return Promise.all(students.map(async s => ({
    ...s,
    threadCost: await computeThreadCost(s.thread_db_id),
  })));
}
```

### `routes/dashboard.js`

- Lokale Definition + `export` von `enrichStudentsWithCost` entfernen
- `import { enrichStudentsWithCost } from '../stores/dashboard.js'` hinzufügen

### `routes/dashboard-ws.js`

- Lokale Definition + Workaround-Kommentar (Zeilen 27–35) entfernen
- `import { enrichStudentsWithCost } from '../stores/dashboard.js'` hinzufügen
- Import-Zeile für `computeThreadCost` aus `cost-service.js` bleibt (wird weiter direkt genutzt)

---

## Implementierungsplan (TDD)

### Schritt 1 — Baseline herstellen

```bash
DB_PATH=:memory: node --test test/dashboard-ws.test.js
```

→ sollte grün sein (DI-Muster, keine echte DB).

Dann:
```bash
DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/**/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
```

→ Die 5 fehlschlagenden Tests in `test/cost-service.test.js` (getWerkzeugLog etc.) notieren: existieren die Funktionen in `cost-service.js`? Falls nicht → entweder Funktion ergänzen oder Test als SKIP markieren.

### Schritt 2 — Tests first (RED)

Neue Datei `test/dashboard-store.test.js`:

```js
// Run: DB_PATH=:memory: node --test test/dashboard-store.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db.js';
```

Mindest-Tests:
- **Test A** — `enrichStudentsWithCost` fügt korrektes `threadCost`-Feld hinzu (leere token_log → threadCost 0)
- **Test B** — `enrichStudentsWithCost` mit leerem Array → `[]`
- **Test C** — Import aus `stores/dashboard.js` zieht **nicht** transitiv `ai-instance.js` ein (kein `process.exit` beim Test ohne APIKEY)

Test C lässt sich strukturell sicherstellen, indem der Test-Import nur `stores/dashboard.js` einzieht und `MODEL_NAME`/`OPENAI_API_KEY` nicht gesetzt sind.

### Schritt 3 — `enrichStudentsWithCost` in `stores/dashboard.js` (GREEN)

Import + Export hinzufügen (keine andere Logik ändern).

### Schritt 4 — Route-Dateien aufräumen

`routes/dashboard.js` und `routes/dashboard-ws.js` auf Store-Import umstellen, lokale Definitionen löschen.

### Schritt 5 — Alle Tests grün

```bash
DB_PATH=:memory: node --test test/dashboard-store.test.js
DB_PATH=:memory: node --test test/dashboard-ws.test.js
DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/**/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
```

---

## Wichtige Gotchas

- **Testrunner ist `node --test`**, nicht vitest (kein `npx vitest` — das Projekt kennt kein vitest).
- `routes/dashboard.js` exportiert `enrichStudentsWithCost` aktuell mit `export`. Nach dem Refactoring entfällt dieser Export. Prüfen ob irgendwo importiert wird (`grep -r 'enrichStudentsWithCost' .`).
- Die 5 fehlschlagenden `cost-service`-Tests (`getWerkzeugLog`, `getAdminCostsByTeacher`) stammen aus den pre-existing Änderungen. Entweder die Funktionen in `cost-service.js` ergänzen **oder** klären ob die Tests für eine andere Session vorgesehen sind. Nicht einfach ignorieren — das npm-Test-Ergebnis muss besser werden, nicht schlechter.
- `stores/dashboard.js` darf `cost-service.js` importieren (kein Zyklus). `cost-service.js` importiert nur `db.js`, `pricing.js`, `stores/token.js` — keine Route-Dateien.
- Nach dem Refactoring ist die `ai-instance.js`-Zirkelabhängigkeit eliminiert: `dashboard-ws.js` → `stores/dashboard.js` → `cost-service.js` (kein Weg zu `ai-instance.js`).

---

## Tests ausführen

```bash
cd /opt/moo-gpt
DB_PATH=:memory: node --test test/dashboard-store.test.js
DB_PATH=:memory: node --test test/dashboard-ws.test.js
DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/**/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
```

---

## Manuelle Tests (Matthias)

- [ ] Dashboard öffnen → Schüler-Liste erscheint mit korrekten Kosten pro Thread
- [ ] Dashboard-WebSocket offen lassen, neue Schüler-Nachricht senden → Kosten-Update kommt in Echtzeit an

Nach erfolgreichen manuellen Tests Issue #128 schließen.
