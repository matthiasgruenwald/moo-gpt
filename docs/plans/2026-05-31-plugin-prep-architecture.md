# Architektur-Plan: Plugin-Vorbereitung

**Datum:** 2026-05-31  
**Ziel:** Codebase für die Migration zu `mod_moogpt` vorbereiten — ohne sofortigen Plugin-Code zu schreiben.  
**Umfang:** 6 Kandidaten, priorisiert nach Dringlichkeit und Hebelwirkung.

---

## Kaskade-Befund (aus Code-Analyse)

**Bestätigter Bug:** Die Widget-Konfigurationskaskade (Systemvorlage → Lehrer-Vorlage → Aktivität) ist partiell kaputt.

`chat-session.js:resolveActivity()` ruft `upsertActivity()` mit nur 4 Feldern auf:

```
opener, upload_mode, title, bot_icon
```

Die folgenden Felder werden beim erstmaligen Anlegen einer Aktivität **nicht** aus dem Template übernommen:

```
audio_input, audio_output, tts_voice, audio_student_options, model, math_mode
```

Diese erhalten Hardcode-Defaults (`'off'`, `'nova'`, `null`), obwohl das Lehrer-Template oder die Systemvorlage Werte setzen könnte.

Für bestehende Aktivitäten: kein Template-Fallback, direkt `getActivity()` → `activities`-DB.

Auch `routes/activity.js` (Config-Seite) und `services/chat-response.js` lesen direkt aus `activities` ohne Template-Kaskade.

---

## Kandidaten-Übersicht

| # | Name | Typ | Dringlichkeit | Plugin-Phase |
|---|------|-----|---------------|--------------|
| A1 | Widget-Config-Resolver | Bug-Fix + Seam | **Hoch** (Bug aktiv) | Phase 1 + 4 |
| B1 | DB-Migrationen versionieren | Wartbarkeit | Mittel | Phase 1 |
| B2 | Prompt-Stack formalisieren | Lesbarkeit | Niedrig | Phase 3 |
| C1 | Auth-Seam dokumentieren | ADR | Mittel | Phase 2 |
| C2 | `moo-bot.js` strukturieren | Struktur | Niedrig | Phase 3 |

---

## A1 — Widget-Config-Resolver (tiefes Modul + Kaskade-Fix)

### Befund

Die Kaskade ist über 5 Stellen verteilt ohne einheitlichen Einstiegspunkt:
- `stores/widget-config.js` — nur Aktivitäts-Zeile, kein Fallback
- `stores/activity.js:getActivity()` — rohe DB-Zeile
- `stores/teacher.js:getTeacherDefaultTemplate()` — Lehrer-Template
- `stores/teacher.js:getSystemTemplate()` — Systemvorlage
- `chat-session.js:resolveActivity()` — partiell, nur beim Erstellen, nur 4 Felder

Wenn ein neues Feld hinzukommt (wie `mathMode` in ADR-0006), müssen alle fünf Stellen angefasst werden.

### Entscheidung

**Neue Datei: `services/widget-config-resolver.js`**

Einzige exportierte Funktion:

```js
resolveWidgetConfig(activityId, userId) → WidgetConfig
```

**Kaskade zur Laufzeit** (nicht beim Erstellen):  
Für jedes Feld: `activities.(field) ?? teacher_default.(field) ?? system_template.(field) ?? hardcoded`

Das bedeutet: `activities`-Felder dürfen NULL sein, wenn der Lehrer sie nicht explizit gesetzt hat. Die Kaskade wird bei jedem Aufruf neu aufgelöst.

**Rückgabe-Objekt (vollständig):**

```js
{
  title, botIcon, opener, uploadMode,
  audioInput, audioOutput, ttsVoice, audioStudentOptions,
  model, mathMode, needsConfig
}
```

**Aufrufer nach Umbau:**
- `chat-session.js:resolveActivity()` → nur noch Aufruf von `resolveWidgetConfig()`
- `services/chat-response.js` → ersetzt `getWidgetConfig()` durch `resolveWidgetConfig()`
- `routes/activity.js` GET → liest über `resolveWidgetConfig()` statt `getActivity()`

**`upsertActivity()` bleibt bestehen** — nur zum Anlegen einer Aktivität bei erstem Besuch (ohne Template-Felder, die dann die Kaskade zur Laufzeit befüllt).

**Validators werden erweitert:** `validateWidgetConfig()` auf alle 10+ Felder ausdehnen (audioOutput, ttsVoice, audioStudentOptions, model validieren).

### Nicht ändern

`stores/widget-config.js:setWidgetConfig()` — schreibt explizit gesetzte Felder, bleibt wie ist.

`stores/activity.js`, `stores/teacher.js` — reine DB-Adapter, unverändert.

### Nutzen

- Kaskade-Bug behoben: Lehrer-Templates gelten vollständig für neue Aktivitäten
- Einzige Seam für Widget-Konfiguration: im Plugin wird nur `resolveWidgetConfig()` durch eine Moodle-DB-Variante ersetzt
- Neues Feld hinzufügen: 1 Stelle (Resolver) statt 5
- Testbar über injizierbare Deps (wie `model-resolver.js`)

---

## B1 — DB-Migrationen versionieren

### Befund

`db.js` enthält ~30 `try/catch`-ALTER-Blöcke ohne Versionsstand:
- Kein Weg zu wissen, welche Migrationen auf einer Installation gelaufen sind
- `audio_output`, `tts_voice`, `audio_student_options` erscheinen **zweimal** (Zeilen 241-243 + 246-248)
- Für XMLDB-Übersetzung muss das Schema lesbar sein: was gehört zu V1, V2, V3 des Plugins

### Entscheidung

**`schema_migrations`-Tabelle** in `db.js` einführen:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
)
```

**Nummerierte Migrations-Array** in `db.js`:

```js
const MIGRATIONS = [
  { version: 1, up: (db) => db.exec(`ALTER TABLE activities ADD COLUMN opener TEXT`) },
  { version: 2, up: (db) => db.exec(`ALTER TABLE activities ADD COLUMN upload_mode TEXT DEFAULT 'off'`) },
  ...
];
```

**`runMigrations(db)`** — führt alle Migrationen aus, die noch nicht in `schema_migrations` stehen.

Die bestehenden try/catch-Blöcke werden in nummerierte Migrationen überführt (doppelte eliminiert).

### Nicht ändern

Das Schema selbst bleibt identisch — nur die Migration-Mechanik wird ersetzt.

### Nutzen

- `grep -A3 'version: 12'` zeigt sofort was in Migrations-Schritt 12 passiert ist
- Doppelte ALTER-Versuche verschwinden
- XMLDB-Übersetzung: Migrations-Nummern werden zu Plugin-`version.php`-Versionsnummern
- Neue Entwickler (und KI-Agenten) sehen sofort den historischen Schema-Verlauf

---

## B2 — Prompt-Stack formalisieren

### Befund

`buildInstructions()` nimmt 6 freie Parameter per Destructuring. Es gibt kein explizites Konzept der "Slots" — welcher Teil kommt aus dem Systemkontext, welcher aus der Aktivität, welcher vom Schüler.

Für das Plugin würden diese Slots aus verschiedenen Moodle-Kontexten kommen:
- `systemContent` → Plugin-Admin-Einstellung
- `erfahrungContent` → Plugin-Tabelle `mdl_moogpt_prompts`
- `task` → Moodle-Aktivitätsbeschreibung (aus Moodle-DB, nicht DOM)
- `studentMemory` → Plugin-Tabelle `mdl_moogpt_student_memory`
- `mathMode` → Plugin-Aktivitätskonfiguration

### Entscheidung

**Keine API-Änderung jetzt.** Die Funktion hat nur eine Callsite (`services/chat-response.js`).

**JSDoc erweitern** mit dem Slot-Konzept:

```js
/**
 * @param {PromptStack} stack
 * @typedef {object} PromptStack
 * @property {string}      [system]         Systemweiter Prompt (Admin)
 * @property {string|null} [studentMemory]  Schüler-Präferenz (global)
 * @property {Date|null}   [dateTime]       Aktuelles Datum/Uhrzeit
 * @property {string|null} [aufgabe]        Aufgabenstellung (Moodle-DOM → später Moodle-DB)
 * @property {string|null} [aufgabenprompt] Aufgabenprompt (Lehrer-Werkzeug)
 * @property {'on'|'off'}  [mathMode]       Fachpräferenz: LaTeX
 */
```

**Umbenennen:** Parameter `hints` → `aufgabenprompt` und `task` → `aufgabe` in der nächsten Iteration (wenn A1 fertig ist, kommt die Config sauber aus `resolveWidgetConfig()`).

### Timing

Sinnvoll als zweiter Schritt nach A1: wenn `resolveWidgetConfig()` den `mathMode` liefert, kann `chat-response.js` direkt `stack.mathMode = cfg.mathMode` setzen — klarer als heute.

---

## C1 — Auth-Seam dokumentieren (ADR)

### Befund

`auth-middleware.js` verwendet eine In-Memory-Map (`dashboardTokens`) als einzigen Auth-Adapter. Im Plugin ersetzt Moodle-Capabilities diese vollständig:
- `requireTeacherAuth` → `require_capability('mod/moogpt:viewdashboard', $context)`
- `requireDashboardAuth` → Moodle-Session + Capability-Check
- `requireAdminAuth` → `require_capability('mod/moogpt:admin', $context)`
- `generateDashboardToken` → entfällt (kein externer Token-Flow mehr)

### Entscheidung

**Kein Code-Umbau jetzt.** Die Middleware ist kompakt, isoliert und funktioniert. Einen DI-Umbau ohne existierende zweite Adapter-Implementierung einzuführen wäre eine hypothetische Abstraktion (YAGNI).

**ADR schreiben:** `docs/adr/0007-auth-seam-token-to-moodle-capabilities.md`

Inhalt:
- Beschreibt die heutige Token-Map als temporäre Auth-Lösung
- Beschreibt die Seam: wo genau Moodle-Capabilities eingesetzt werden
- Dokumentiert, dass `generateDashboardToken` im Plugin komplett entfällt (kein externer Token-Flow, ADR implizit in der Roadmap beschlossen, aber nirgends als ADR festgehalten)
- Referenziert Moodle-Plugin-Roadmap Pflichtentscheidung #2 und #5

### Nutzen

- Der nächste Entwickler weiß: `auth-middleware.js` ist die einzige Stelle, die beim Plugin-Port ausgetauscht wird
- Verhindert, dass zukünftige Architektur-Reviews die Token-Map als dauerhaft betrachten
- Macht implizite Roadmap-Entscheidungen explizit

---

## C2 — `moo-bot.js` intern strukturieren

### Befund

2485 Zeilen ohne innere Gliederung. Enthält:
- WebSocket-Verbindung + Message-Handling (`ChatCore`)
- Chat-UI: Nachrichten, History, Scroll, Locked-State
- Audio-Aufnahme + Transkription (`AudioManager`)
- TTS-Button, Popover, Stimmwahl, Autoplay (`TtsManager`)
- Memory-Popover, CRUD (`MemoryManager`)
- Config-Overlay-Trigger + Dashboard-Token-Weiterleitung

Für AMD-Module (Moodle-Standard) müsste jedes davon ein eigenes `define([...], function() {...})` werden.

### Entscheidung

**Keine Datei-Aufteilung jetzt** (würde Browser-Serving und Import-Struktur ändern).

**Interne Klassen/Objekte** einführen — jede benannte Einheit entspricht einem zukünftigen AMD-Modul:

```
ChatCore        — WS-Init, Message-Send, History-Load, Locked-State
ChatUI          — DOM-Manipulation, Render, Scroll
AudioManager    — Mikrofon, Aufnahme, Transkription-HTTP
TtsManager      — Button, Popover, Stimmwahl, Autoplay, History-Buttons
MemoryManager   — Popover, GET/PUT student-memory
```

**Abgrenzung:** `moo-bot.js` wird vor `dashboard.js` angefasst, weil `moo-bot.js` Plugin-V1-kritisch ist (Phase 3 der Roadmap). `views/dashboard/*.html` und die zugehörigen JS-Dateien wandern erst in Phase 4 ins Plugin.

### Nicht in diesem Schritt

Keine Datei-Aufteilung, keine AMD-Konvertierung, kein Webpack/Rollup. Nur: Klassen/Objekte identifizieren und Code in Sektionen aufteilen.

### Nutzen

- Port zu AMD: jede Klasse wird zu `define(['core/ajax', ...], function(Ajax) { return { ... }; })`
- Fehlerisolation: ein TTS-Bug betrifft nicht AudioManager-Tests
- Für spätere Automatisierung (z.B. Playwright-Tests): testbare Einheiten ohne DOM-Wirrwarr

---

## Empfohlene Reihenfolge

```
A1  →  B1  →  C1 (ADR)  →  B2  →  C2
```

**Begründung:**

1. **A1 zuerst:** Aktiver Bug (Templates greifen nicht vollständig). Schafft zugleich die wichtigste Seam für Plugin-Phase 1.
2. **B1:** Leicht abgegrenzt, kein Risiko, macht XMLDB-Übersetzung unmittelbar lesbar.
3. **C1 (ADR):** Schnell, kein Code, sichert Wissen über die Auth-Seam.
4. **B2:** Hängt auf A1 (wenn Config sauber aus Resolver kommt). Nur Doku + Rename.
5. **C2:** Größter Aufwand, aber Plugin-V1-Zeitdruck entscheidet über Timing.

---

## Offene Frage (bewusst vertagt)

**Echtzeit/Streaming-Entscheidung** (Roadmap-Pflichtentscheidung #6):  
Bestimmt ob `services/chat-response.js` + WebSocket portiert oder durch Polling ersetzt wird.  
Kein Handlungsbedarf bis Plugin-Phase 3 beginnt. Bis dahin bleibt der Streaming-Code unverändert.
