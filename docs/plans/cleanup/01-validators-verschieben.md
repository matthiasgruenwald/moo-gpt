# Schritt 01: validators.js verschieben

Kleinste Änderung im Plan. Reine Datei-Verschiebung + Umbenennung. Keine Logikänderung.

**Problem:** `routes/validators.js` liegt in der HTTP-Schicht, enthält aber pure Domain-Validierung ohne HTTP-Bezug. Routes müssen aus dem eigenen Verzeichnis importieren, was die Abhängigkeitsrichtung umkehrt.

---

## Änderungen

### 1. Neue Datei: `validators.js` (Root)

```js
export const VALID_UPLOAD_MODES = ['off', 'images', 'files'];
export const VALID_BOT_ICONS    = ['grw', 'grw2', 'weiblich'];

export function validateWidgetConfig(uploadMode, botIcon) {
  if (uploadMode !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return `Ungültiger uploadMode: ${uploadMode}`;
  if (botIcon !== undefined && !VALID_BOT_ICONS.includes(botIcon))
    return `Ungültiges botIcon: ${botIcon}`;
  return null;
}
```

### 2. `routes/validators.js` löschen

### 3. Imports aktualisieren

**routes/activity.js**
```diff
-import { validateTemplateFields } from './validators.js';
+import { validateWidgetConfig } from '../validators.js';
```
Alle Aufrufe: `validateTemplateFields(...)` → `validateWidgetConfig(...)`

**routes/admin.js**
```diff
-import { validateTemplateFields } from './validators.js';
+import { validateWidgetConfig } from '../validators.js';
```
Alle Aufrufe umbenennen.

**routes/teacher.js**
```diff
-import { validateTemplateFields } from './validators.js';
+import { validateWidgetConfig } from '../validators.js';
```
Alle Aufrufe umbenennen.

### 4. Bonus: `config-cache.js` — Object.freeze

Einzeiler, kein eigener Schritt:
```diff
-export const getCachedConfig = () => _config;
+export const getCachedConfig = () => Object.freeze({ ..._config });
```
Verhindert stille Mutation des zurückgegebenen Objekts durch Caller.

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `routes/validators.js` | Löschen |
| `validators.js` | Neu anlegen |
| `routes/activity.js` | Import + 1 Aufruf umbenennen |
| `routes/admin.js` | Import + 1 Aufruf umbenennen |
| `routes/teacher.js` | Import + 2 Aufrufe umbenennen |
| `config-cache.js` | Optional: Object.freeze Einzeiler |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → Tab Einstellungen → Aktivitätskonfiguration (Bot-Icon oder Upload-Modus) ändern → speichern → kein Fehler
3. Dashboard → Tab Einstellungen → Lehrer-Vorlage speichern → kein Fehler
4. Admin-Tab → Systemvorlage speichern → kein Fehler
