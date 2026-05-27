# Handoff #126 — Widget-Konfiguration Seam in stores/widget-config.js einführen

**GitHub Issue:** #126  
**Label:** ready-for-agent  
**Blocked by:** — (unabhängig, kann sofort gestartet werden)  
**Letzter relevanter Commit:** `69b2f14` (fix: drei UI-Bugs nach Overlay-Expand)  
**Ziel:** `stores/widget-config.js` als dedizierter Seam für alle Widget-Konfigurationsfelder. `stores/activity.js` behält nur Lifecycle-Operationen.

---

## Einstieg für neue Session

```
/karpathy-guidelines
/tdd
```

---

## Ist-Zustand (verifiziert 2026-05-27)

### `stores/activity.js` (49 Zeilen) — zwei Concerns gemischt:

**Concern 1: Aktivitäts-Lifecycle** (bleibt)
- `upsertActivity(activity_id, activity_name, opener, upload_mode, title, botIcon)` — 6 Positional-Args
- `getActivity(activity_id)` — liest alle Felder inkl. Widget-Konfiguration
- `setTeacherIfUnset(activity_id, teacher_id, teacher_name)`

**Concern 2: Widget-Konfiguration** (→ nach `stores/widget-config.js`)
- `setActivityConfig(activity_id, opener, uploadMode, title, botIcon, audioInput, audioOutput, ttsVoice, audioStudentOptions, model)` — **10 Positional-Args!**

### Callers von `setActivityConfig`:
```
routes/activity.js:195  setActivityConfig(activityId, opener, uploadMode, title, botIcon,
                          audioInput, audioOutput, ttsVoice, audioStudentOptions, validModel)
```

### Callers von `getActivity`:
```
routes/activity.js:166  — alle Felder inkl. Widget-Konfiguration
routes/dashboard.js     — activity_name, opener
services/chat-session.js (od. ähnl.) — upload_mode, audio_input, audio_output, …
routes/admin.js         — Aktivitätsdaten
```

### `hints` (Erfahrungsprompt) ist **nicht** in `setActivityConfig`
`hints` wird separat über `stores/prompt.js` (`getActiveErfahrungsprompt`, `saveErfahrungsprompt`) verwaltet. `getWidgetConfig` soll `hints` **nicht** zurückgeben — das bleibt Sache der Prompt-Store-Abfrage.

---

## Widget-Konfigurationsfelder (DB-Spalten)

| JS-Name           | DB-Spalte              | Default   |
|-------------------|------------------------|-----------|
| `opener`          | `opener`               | `null`    |
| `uploadMode`      | `upload_mode`          | `null`    |
| `title`           | `title`                | `null`    |
| `botIcon`         | `bot_icon`             | `'grw'`   |
| `audioInput`      | `audio_input`          | `'off'`   |
| `audioOutput`     | `audio_output`         | `'off'`   |
| `ttsVoice`        | `tts_voice`            | `'nova'`  |
| `audioStudentOptions` | `audio_student_options` | `'off'` |
| `model`           | `model`                | `null`    |

---

## Zielzustand

### Neues Modul: `stores/widget-config.js`

```js
/**
 * Widget-Konfiguration einer Aktivität schreiben (Partial-Update möglich).
 * config: { opener, uploadMode, title, botIcon, audioInput, audioOutput,
 *           ttsVoice, audioStudentOptions, model }
 * Alle Felder optional — nur gesetzte Felder werden aktualisiert.
 */
export function setWidgetConfig(activity_id, config) { … }

/**
 * Nur die Widget-Konfigurationsfelder lesen (kein activity_name, kein teacher_id).
 */
export function getWidgetConfig(activity_id) { … }
```

### `stores/activity.js` danach:
- `upsertActivity`, `getActivity`, `setTeacherIfUnset` bleiben unverändert
- `setActivityConfig` entfernt

### `routes/activity.js` danach:
```js
// Alt:
import { getActivity, setActivityConfig } from '../stores/activity.js';
// Neu:
import { getActivity } from '../stores/activity.js';
import { setWidgetConfig } from '../stores/widget-config.js';

// Alt (Zeile 195):
setActivityConfig(activityId, opener ?? null, uploadMode ?? null, title ?? null,
  botIcon ?? null, audioInput ?? null, audioOutput ?? null, ttsVoice ?? null,
  audioStudentOptions ?? null, validModel);
// Neu:
setWidgetConfig(activityId, { opener, uploadMode, title, botIcon,
  audioInput, audioOutput, ttsVoice, audioStudentOptions, model: validModel });
```

---

## Implementierungsplan (TDD)

### Schritt 1 — Baseline

```bash
DB_PATH=:memory: node --test test/activity-store.test.js
```

→ 8 Tests, alle grün (verifiziert).

### Schritt 2 — Tests first (RED)

Neue Datei `test/widget-config-store.test.js`:

```js
// Run: DB_PATH=:memory: node --test test/widget-config-store.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
```

Mindest-Tests:
- **Test A** — Roundtrip: `setWidgetConfig` → `getWidgetConfig` liest dieselben Werte
- **Test B** — Partial-Update: nur `audioOutput` setzen, andere Felder bleiben unverändert
- **Test C** — Defaults: `botIcon` default `'grw'`, `audioOutput` default `'off'`, `ttsVoice` default `'nova'`, `audioStudentOptions` default `'off'`
- **Test D** — Unbekannte Felder im config-Objekt → kein SQL-Fehler, werden ignoriert

### Schritt 3 — Implementierung (GREEN)

Erstelle `stores/widget-config.js`. SQL-Logik aus `setActivityConfig` übernehmen (ON CONFLICT … DO UPDATE SET). Object-destructuring statt Positional-Args.

### Schritt 4 — Route aktualisieren

`routes/activity.js`:
- Import von `setActivityConfig` entfernen, `setWidgetConfig` importieren
- Zeile 195 umschreiben

### Schritt 5 — `setActivityConfig` entfernen

In `stores/activity.js` die Funktion löschen.

### Schritt 6 — Alle Tests grün

```bash
DB_PATH=:memory: node --test test/activity-store.test.js test/widget-config-store.test.js
npm test
```

---

## Wichtige Gotchas

- **Testrunner ist `node --test`**, nicht vitest (kein `npx vitest` — das Projekt kennt kein vitest).
- `upsertActivity` und `setWidgetConfig` überlappen bei `opener`, `upload_mode`, `title`, `bot_icon`. Die Überlappung ist gewollt: Widget-Aufruf setzt diese beim ersten Kontakt, Config-Overlay überschreibt sie. Overlap beibehalten.
- `getActivity` bleibt in `stores/activity.js` — **nicht** versuchen, alle Callers auf `getWidgetConfig` umzustellen. Zu großer Scope für dieses Issue.
- `hints`/`erfahrungsprompt` kommt aus `stores/prompt.js`, **nicht** aus `stores/activity.js` — `getWidgetConfig` gibt kein `hints` zurück.
- `activity-store.test.js` importiert direkt `setActivityConfig` — diese Tests werden nach dem Refactoring **angepasst** (Import → `stores/widget-config.js`) oder als Regressions-Tests belassen falls `setActivityConfig` als deprecated Wrapper bleibt.

---

## Tests ausführen

```bash
cd /opt/moo-gpt
DB_PATH=:memory: node --test test/activity-store.test.js
DB_PATH=:memory: node --test test/widget-config-store.test.js
npm test
```

---

## Manuelle Tests (Matthias)

- [ ] Config-Overlay öffnen, Bot-Titel ändern → Änderung wird gespeichert und nach Reload sichtbar
- [ ] Audio-Einstellung (`audioInput`) im Overlay ändern → Widget-Verhalten ändert sich entsprechend
- [ ] Neue Aktivität erstellen → Defaults werden korrekt gesetzt

Nach erfolgreichen manuellen Tests Issue #126 schließen.
