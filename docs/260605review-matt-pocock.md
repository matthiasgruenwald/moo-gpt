# Code-Review dev → main (Matt-Pocock Zwei-Achsen-Review)

**Datum:** 2026-06-05
**Branch:** `dev` gegen `main`
**Methode:** `/review` (zwei parallele Sub-Agenten: Standards-Achse + Spec-Achse)
**Diff-Umfang:** 58 Dateien, +5050 / −4225 Zeilen, 27 Commits (#168–#188)

---

## Achse 1: Standards (Code-Konventionen des Repos)

Quellen: `CLAUDE.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `coding-style.md`, ADR 0001/0004/0005/0007.

### Harte Verstöße

**1. `public/config.js` — 917 Zeilen (Limit: 800)**
`coding-style.md` §File Organization. Der Diff schiebt die Datei über die 800-Zeilen-Grenze. Die Temperature-/Assist-Model-UI-Helfer (`getTemperatureValue`, `getAssistTemperatureValue`, `updateTemperatureField`, `updateAssistTemperatureField`, `updateTemperatureDisplay`) sind kohäsiv genug, um in ein eigenes Helper-Modul ausgelagert zu werden.

**2. Mutation des `initial`-Snapshots in `public/config.js`**
`coding-style.md` §Immutability (CRITICAL) — „ALWAYS create new objects, NEVER mutate existing ones". Nach erfolgreichem Speichern werden `initial.chatTemperature`, `initial.assistModel` und `initial.assistTemperature` in-place mutiert (~Zeile 1247). Muss sein: `initial = { ...initial, chatTemperature, assistModel, assistTemperature }`.

**3. Issue #183-Spalten umgehen das versionierte Migrationssystem**
Derselbe PR, der das `MIGRATIONS`-Array einführt (#169), umgeht es sofort für die drei neuen Spalten (`assist_model`, `chat_temperature`, `assist_temperature`) — sie landen über nackte `try/catch`-Blöcke in `initDb()` (db.js ~Zeile 523–532), außerhalb von `MIGRATIONS`. Diese Spalten sind für `schema_migrations` unsichtbar. **Architektonisch der gravierendste Befund** — er untergräbt genau die Änderung, die der Sinn von #169 war.

**4. Stilles Catch-all in `runMigrations` verschluckt alle Fehler**
`coding-style.md` §Error Handling — „Never silently swallow errors". `try { up(db) } catch (_) {}` (db.js ~Zeile 382) unterdrückt jeden Fehler, inkl. Syntaxfehler und Constraint-Verletzungen. Der Kommentar „Ignoriere Fehler wie duplicate column name" ist zu weit gefasst. Mindestens `console.error` loggen.

### Ermessensfragen (medium)

**5. `env-config.js`-Getter geben bei DB-Fehler still Defaults zurück**
`getAvailableModels()`, `getGenModel()` etc. fangen `_` ohne Logging. Eine fehlkonfigurierte DB fällt still zurück; der Aufrufer bekommt kein Signal. Geringes Praxisrisiko, aber inkonsistent mit dem Standard zur expliziten Fehlerbehandlung.

**6. `isReasoningModel` hardcodiert Modell-Präfixe in `public/config.js`**
`coding-style.md` — „No hardcoded values". Die Regex `/^(o1|o3|o4-)/` ist ein Magic String, der neue Reasoning-Modelle (z. B. `o5-`) still verfehlt. Sollte eine benannte Konstante / Config sein.

### Keine Befunde
Keine hardcodierten Secrets, kein Debug-`console.log` in Produktionspfaden, ADR 0001/0004/0005/0007 respektiert, `model-resolver.js` innerhalb der Limits.

---

## Achse 2: Spec (treue Umsetzung der Issues)

Quellen: GitHub-Issues #168–#188 (`matthiasgruenwald/moo-gpt`).

### Lücken / Abweichungen

**1. #183-Spalten nicht im `MIGRATIONS`-Array (= #169-Muster umgangen)**
Issue #183: „DB-Migration fügt alle drei Spalten hinzu." Durch das Landen außerhalb von `MIGRATIONS` sind diese Spalten von `schema_migrations` ungetrackt. Überschneidet sich mit Standards-Verstoß #3 — **beide Achsen flaggen dies als den kritischsten Befund.**

**2. #183-Kaskade fehlt für die drei neuen Felder**
Issue #183: „Null bedeutet jeweils 'Fallback auf übergeordnete Ebene'." `services/widget-config-resolver.js` lässt `assist_model`, `chat_temperature`, `assist_temperature` aber komplett aus (`needsConfig` und Rückgabewert ohne diese Felder). `chat-response.js` und `prompt-assist.js` lesen sie direkt aus `activities` — unter Umgehung der Lehrer- und System-Vorlagen-Ebenen. **Lehrer-Vorlagen für diese Felder werden zur Laufzeit still ignoriert.**

**3. #181 — `INSTALL.md` dokumentiert weiterhin entfernte Env-Variablen**
Issue #181 hat `AVAILABLE_MODELS` und `AVAILABLE_BOT_ICONS` stillgelegt. Der Code ist korrekt, aber `INSTALL.md` listet beide noch mit Beispielwerten. Neue Deployments konfigurieren Variablen, die nichts mehr bewirken.

**4. #171 — `ConfigOverlayTrigger`-Klasse fehlt (minor)**
Diff hat `MemoryManager`, `TtsManager`, `AudioManager`, `ChatUI`, `ChatCore`, `MOOBOT`. Die Issue-Tabelle nennt explizit nur `ChatCore` und `ChatUI`; Overlay-Logik bleibt in `MOOBOT`/`ChatCore` inlined. Ob Lücke, hängt davon ab, ob die Klassentabelle erschöpfend war. Geringfügig.

### Scope Creep
Keiner. Zusätzliche Getter (`getAvailableBotIcons()`, `getGenModel()` etc.) sind direkt durch #180/#184 getrieben.

### Vollständig & korrekt umgesetzt
#168, #169, #170, #171, #172, #179, #180, #184, #185, #186, #187, #188.

---

## Empfohlene nächste Schritte (Priorität)

| # | Aktion | Datei(en) | Achse |
|---|--------|-----------|-------|
| 1 | `assist_model`, `chat_temperature`, `assist_temperature` ins `MIGRATIONS`-Array verschieben; nackte try/catch-Blöcke aus `initDb()` entfernen | `db.js` | Standards #3 / Spec #1 |
| 2 | Drei neue Felder in `services/widget-config-resolver.js`-Kaskade aufnehmen, damit Lehrer-/System-Vorlagen-Fallback greift | `widget-config-resolver.js`, `chat-response.js`, `prompt-assist.js` | Spec #2 |
| 3 | `initial`-Mutation → `initial = { ...initial, ... }` | `public/config.js` ~Z. 1247 | Standards #2 |
| 4 | Stilles Catch in `runMigrations` durch mind. `console.error` ersetzen | `db.js` ~Z. 382 | Standards #4 |
| 5 | Temperature-/Assist-UI-Helfer auslagern, `config.js` unter 800 Zeilen | `public/config.js` | Standards #1 |
| 6 | `AVAILABLE_MODELS` und `AVAILABLE_BOT_ICONS` aus `INSTALL.md` entfernen | `INSTALL.md` | Spec #3 |
| 7 | `isReasoningModel`-Präfixliste in benannte Konstante auslagern | `public/config.js` | Standards #6 |

**Schlimmster Einzelbefund:** Die Migrations-Umgehung (Standards #3 / Spec #1) — sie untergräbt den gesamten Zweck von Issue #169 und macht die drei neuen Config-Felder bei frischen oder zurückgesetzten Datenbanken für den Migrations-Tracker unsichtbar.
