# P5a — Snippet-Refactoring: DB-gesteuerte Konfiguration

**Voraussetzung:** P5 ✓  
**⚠️ Vor Implementierung: `/grill-me`-Skill ausführen!**

## Ziel

Das Snippet enthält danach nur noch das Nötigste (Host, Protocol, Port).
Alle Einstellungen (Titel, Bot-Icon, Opener, Hinweise, Upload-Modus) kommen aus der DB.
Lehrer können Voreinstellungen für neue Aktivitäten hinterlegen, damit das Anlegen mehrerer Bots schnell geht.

## Geplante Änderungen

### 1. DB-Schema

- `activities`-Tabelle: Felder `title` (TEXT) und `bot_icon` (TEXT) ergänzen
- Neue Tabelle `teacher_defaults`: eine Zeile pro Lehrer mit Standardwerten für Titel, Bot-Icon, Opener, Upload-Modus und Hinweis-Vorlage

### 2. Server-Endpoints

- `GET /api/activity-config/:id` gibt auch `title` und `bot_icon` zurück
- `PUT /api/activity-config/:id` nimmt alle Felder (inkl. title, bot_icon)
- `GET /api/teacher/defaults?token=` — Lehrer-Voreinstellungen lesen
- `PUT /api/teacher/defaults?token=` — Lehrer-Voreinstellungen speichern

### 3. Initialisierung einer neuen Aktivität

Beim ersten Verbinden (Aktivität noch nicht in DB):
1. Server erkennt: kein DB-Eintrag für diese activityId
2. Server lädt Lehrer-Voreinstellungen und schreibt sie als ersten DB-Eintrag
3. Server signalisiert dem Bot: „Neue Aktivität, Config-Overlay öffnen"
4. Bot öffnet das Config-Overlay automatisch, damit der Lehrer die Voreinstellungen ggf. anpassen kann

### 4. moo-bot.js

- Snippet-Werte (title, opener, icon, hints, uploadMode) werden NICHT mehr aus dem DOM gelesen
- Stattdessen: nach Token-Empfang `GET /api/activity-config` aufrufen und UI damit befüllen
- Fallback auf Default-Werte nur wenn kein DB-Eintrag existiert

### 5. Neues Snippet (moogpt.txt v2)

Minimaler Body — nur Host-Konfiguration, kein Settings-DOM mehr:

```html
<script type="module" async id="moo-bot">
  import { MOOBOT } from 'https://gpt.gruenwald.fun/moo-bot.js';
  new MOOBOT({ host: "gpt.gruenwald.fun", protocol: "https", port: 443 });
</script>
```

### 6. Config-Seite erweitern

- Felder Titel und Bot-Icon in `config.html` / `config.js` ergänzen
- Neue Seite oder Dashboard-Tab für Lehrer-Voreinstellungen

## Verification

1. Neues Snippet in Moodle einfügen (ohne Settings-Tabelle)
2. Als Lehrer laden → Config-Overlay öffnet automatisch mit Voreinstellungen
3. Einstellungen im Overlay anpassen und speichern
4. Als Schüler laden → Bot verwendet DB-Werte (Titel, Icon, Opener etc.)
5. Zweite Aktivität anlegen → Voreinstellungen greifen sofort, minimale Anpassung nötig
