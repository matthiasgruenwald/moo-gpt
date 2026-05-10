# P1 — Bugs (3 Issues)

## B1: Enter-Taste für Kriterien-Eingabe

**Datei:** `public/dashboard.js`

Nach dem bestehenden `click`-Listener auf `#criteria-add-btn` (ca. Zeile 1139) einen `keydown`-Listener auf `#criteria-input` einfügen:

```js
document.getElementById('criteria-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('criteria-add-btn').click();
});
```

## B2: GPT-Modell-Anzeige leer

**Root cause (wahrscheinlich):** `populateGenModelSelects` (dashboard.js:25) wird durch `applySettingsData` aufgerufen (Zeile 899), das nur läuft wenn `loadSettings()` nicht durch Token-Fehler abbricht. Debug-Pfad:
- `GET /api/admin/config?token=…` in DevTools prüfen — gibt er 200 + `genModels`?
- Wenn 403: Token-Weitergabe im URL-Parameter prüfen (`params.get('token')` Zeile 12)
- `GEN_MODELS` auf server.js:247 ist korrekt definiert
- Fix: falls `token` leer ist, Fallback oder Fehlermeldung im Dashboard

**Dateien:** `public/dashboard.js`, ggf. `server.js`

## B3: Versionshistorie — Expand + Delete

**Betrifft:** `loadPromptHistory()` (dashboard.js:983) und `loadErfahrungspromptHistory()` (dashboard.js:1462)

**Frontend (dashboard.js):** Expand- und Delete-Button pro History-Item; Expand via CSS-Transition; Delete via `DELETE /api/admin/prompt-history/:id`.

**Backend (server.js):**
```
DELETE /api/admin/prompt-history/:id?token=
DELETE /api/erfahrungsprompt-history/:id?activityId=&token=
```

**db.js:** `deletePromptHistoryEntry(id)` und `deleteErfahrungspromptHistoryEntry(id)` — Guard: nie die Zeile mit höchster `version` löschen.

## Verification

Browser-Test + `test.http`
