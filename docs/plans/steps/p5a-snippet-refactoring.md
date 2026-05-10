# P5a — Snippet-Refactoring: DB-gesteuerte Konfiguration ✓

**Voraussetzung:** P5 ✓  
**Status:** ✓ done (2026-05-10)

## Ziel

Das Snippet enthält danach nur noch das Nötigste (Host, Protocol, Port).
Alle Einstellungen (Titel, Bot-Icon, Opener, Upload-Modus) kommen aus der DB.
Lehrer können Voreinstellungen hinterlegen, damit das Anlegen neuer Aktivitäten schnell geht.

## Design-Entscheidungen (aus /grill-me)

| Frage | Entscheidung |
|-------|-------------|
| Config-Lieferung an Bot | Via WS-Token-Nachricht (zusammen mit dem Token) |
| Neue Aktivität, Lehrer kommt zuerst | DB-Eintrag aus teacher_defaults, Badge auf Zahnrad-Button |
| Neue Aktivität, Schüler kommt zuerst | DB-Eintrag mit Hardcoded-Defaults, kein Badge |
| Badge-Bedingung | `title IS NULL` in activities |
| Alte Snippets (noch im Einsatz) | Bot ignoriert Constructor-Werte, DB gewinnt |
| task-HTML | moo-bot.js liest `document.querySelector('.activity-description')` selbst |
| hints/erfahrungsprompt | Server liest erfahrungsprompt direkt aus DB, Bot sendet keine hints mehr |
| Rendering-Timing | Bot wartet auf Token-Nachricht, dann einmaliges Rendering |
| teacher_defaults UI | "Als meine Voreinstellung speichern"-Button in config.html |
| Vorlagen-Bibliothek | → P5b (separater Plan) |

## Geplante Änderungen

### 1. DB-Schema

Migrationen (via try/catch wie bestehende Migrationen):

```sql
ALTER TABLE activities ADD COLUMN title TEXT;
ALTER TABLE activities ADD COLUMN bot_icon TEXT;

CREATE TABLE IF NOT EXISTS teacher_defaults (
  moodle_user_id TEXT PRIMARY KEY,
  title          TEXT,
  bot_icon       TEXT DEFAULT 'grw',
  opener         TEXT,
  upload_mode    TEXT DEFAULT 'off',
  hints_template TEXT,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. db.js — Neue Funktionen

```js
getTeacherDefaults(userId)        // → row | null
setTeacherDefaults(userId, data)  // upsert
```

Bestehende `upsertActivity` und `setActivityConfig` um `title` + `bot_icon` erweitern.
Bestehende `getActivity` gibt auch `title` + `bot_icon` zurück.

### 3. server.js — WS-Connect-Logik

Beim WS-Connect (wenn Bot activityId + userId schickt):

1. `getActivity(activityId)` aufrufen
2. Wenn kein Eintrag:
   - Wenn Lehrer: `getTeacherDefaults(userId)` laden → activity anlegen mit diesen Werten
   - Wenn Schüler: activity anlegen mit Hardcoded-Defaults (`title = null`, `bot_icon = 'grw'`, `opener = null`, `upload_mode = 'off'`)
3. `erfahrungsprompt` via `getActiveErfahrungsprompt(activityId)` laden
4. Token-Nachricht erweitern:

```json
{
  "type": "token",
  "token": "...",
  "activityId": "...",
  "config": {
    "title": "Lern-Assistent",
    "botIcon": "grw",
    "opener": "Hallo!",
    "uploadMode": "off",
    "needsConfig": true
  }
}
```

`needsConfig = activity.title IS NULL` — signalisiert dem Bot, den Badge zu zeigen.

**Systemprompt-Building:** `hints` aus dem WS-Init-Message des Bots entfernen.
Server holt `erfahrungsprompt` direkt aus DB wenn er eine Antwort generiert.

### 4. server.js — REST-Endpoints

`GET /api/activity-config/:activityId` — `title` und `botIcon` ergänzen:
```json
{
  "activityId": "...",
  "activityName": "...",
  "title": "...",
  "botIcon": "grw",
  "opener": "...",
  "uploadMode": "off",
  "erfahrungsprompt": "...",
  "myModel": null,
  "availableModels": [...]
}
```

`PUT /api/activity-config/:activityId` — `title` und `botIcon` entgegennehmen.

Neue Endpoints für Teacher-Defaults:
- `GET /api/teacher/defaults?token=` — Defaults der Lehrkraft lesen
- `PUT /api/teacher/defaults?token=` — Defaults speichern

### 5. moo-bot.js

- Constructor: erwartet nur `{ host, protocol, port }` (alle anderen Felder werden ignoriert)
- **Kein Rendering vor Token-Empfang** — Bot wartet auf WS-Token-Nachricht
- Nach Token: `config` aus Nachricht extrahieren, UI mit echten Werten rendern
- `task`-HTML: `document.querySelector('.activity-description')?.innerHTML` selbst lesen (nicht mehr aus Constructor)
- Badge-Logik: wenn `config.needsConfig === true && isTeacher` → roter Punkt auf Zahnrad-Button
- WS-Init-Message: `hints`-Feld entfernen

### 6. config.html / config.js

Neue Felder ergänzen:
- Titel (Text-Input, `id="cfg-title"`)
- Bot-Icon (Select: `grw | grw2 | weiblich`, `id="cfg-bot-icon"`)

GET lädt `title` + `botIcon` aus API, PUT sendet sie zurück.

Neuer Button: **"Als meine Voreinstellung speichern"** → `PUT /api/teacher/defaults`
mit aktuellen Feldwerten.

### 7. Snippet (moogpt.txt v2)

```html
<script type="module" async id="moo-bot">
  import { MOOBOT } from 'https://gpt.gruenwald.fun/moo-bot.js';
  new MOOBOT({ host: "gpt.gruenwald.fun", protocol: "https", port: 443 });
</script>
```

Kein `<div id="moo-settings">` mehr, kein DOM-Block, kein JavaScript für DOM-Extraktion im Snippet.

## Verification

1. Neues Snippet in Moodle einfügen (nur 3 Zeilen)
2. Als Lehrer laden → Badge auf Zahnrad-Button sichtbar (Aktivität neu, title NULL)
3. Zahnrad öffnen → Config-Overlay zeigt leere Felder + Default-Werte aus teacher_defaults
4. Titel + Icon setzen, speichern → Badge verschwindet beim nächsten Reload
5. Als Schüler laden → Bot rendert mit DB-Werten (kein Flackern, kein Badge)
6. "Als meine Voreinstellung speichern" → nächste neue Aktivität übernimmt diese Werte
7. Altes Snippet in bestehender Aktivität → Bot ignoriert Constructor-Werte, DB-Werte gewinnen
8. Erfahrungsprompt aus Config-Overlay setzen → wird korrekt im Systemprompt verwendet (ohne Bot-Roundtrip)
