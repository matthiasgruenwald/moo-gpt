# Schritt 2: routes/validators.js

Gemeinsame Template-Validierung, die in 3 verschiedenen Route-Modulen gebraucht wird.

---

## Zweck

`validateTemplateFields()` und ihre Konstanten stehen aktuell in `server.js` (Zeilen 227–234).
Sie werden aufgerufen von:

- `routes/activity.js` — PUT /api/activity-config (Zeile 261)
- `routes/teacher.js` — POST/PUT /api/teacher/templates (Zeilen 401, 414)
- `routes/admin.js` — PUT /api/admin/system-template (Zeile 456)

Da alle drei in eigene Module wandern, braucht es einen gemeinsamen Ort.

---

## Vollständige Implementierung

```js
// routes/validators.js

export const VALID_UPLOAD_MODES = ['off', 'images', 'files'];
export const VALID_BOT_ICONS    = ['grw', 'grw2', 'weiblich'];

export function validateTemplateFields(uploadMode, botIcon) {
  if (uploadMode !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return 'Ungültiger uploadMode';
  if (botIcon !== undefined && botIcon !== '' && !VALID_BOT_ICONS.includes(botIcon))
    return 'Ungültiges botIcon';
  return null;
}
```

---

## Änderungen in server.js

**Entfernen** (Zeilen 227–234):
```js
const VALID_UPLOAD_MODES = ['off', 'images', 'files'];
const VALID_BOT_ICONS    = ['grw', 'grw2', 'weiblich'];

function validateTemplateFields(uploadMode, botIcon) { ... }
```

**Importieren** (temporär, bis alle Route-Module extrahiert sind):
```js
import { validateTemplateFields } from './routes/validators.js';
```

Der Import wird in Schritt 11 entfernt wenn `server.js` keine Route-Handler mehr enthält.

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# Template-Endpunkte testen:
# PUT /api/activity-config mit ungültigem uploadMode → 400
# PUT /api/teacher/templates/:id mit ungültigem botIcon → 400
```
