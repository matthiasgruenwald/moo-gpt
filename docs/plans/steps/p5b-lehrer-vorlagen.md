# P5b — Lehrer-Vorlagen-Bibliothek

**Voraussetzung:** P5a ✓

## Ziel

Statt eines einzigen namenlosen `teacher_defaults`-Eintrags pro Lehrer: ein vollwertiger Vorlagen-Speicher. Lehrkräfte können benannte Vorlagen anlegen (z.B. "Biologie Jg. 9", "Quiz-Standard") und diese beim Einrichten neuer Aktivitäten laden.

## Geplante Änderungen

### 1. DB-Schema

- Tabelle `teacher_defaults` (aus P5a) wird zu **`teacher_templates`** migriert
- Neue Spalten: `name` (TEXT), `is_default` (BOOLEAN DEFAULT 0)
- Schema:

```sql
CREATE TABLE teacher_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  moodle_user_id TEXT NOT NULL,
  name           TEXT NOT NULL,
  title          TEXT,
  bot_icon       TEXT,
  opener         TEXT,
  upload_mode    TEXT DEFAULT 'off',
  hints_template TEXT,
  is_default     INTEGER DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Server-Endpoints

- `GET /api/teacher/templates?token=` — alle Vorlagen der Lehrkraft
- `POST /api/teacher/templates?token=` — neue Vorlage speichern (Body: name + alle Config-Felder)
- `PUT /api/teacher/templates/:id?token=` — Vorlage aktualisieren
- `DELETE /api/teacher/templates/:id?token=` — Vorlage löschen
- `PUT /api/teacher/templates/:id/set-default?token=` — als Standard markieren (setzt is_default bei allen anderen auf 0)

### 3. config.html Erweiterungen

- Dropdown "Vorlage laden" — zeigt alle eigenen Vorlagen der Lehrkraft
- Wahl einer Vorlage befüllt alle Felder des Config-Overlays
- Button "Als Vorlage speichern" → Dialog fragt nach Name → speichert neue Vorlage
- Vorlagen mit `is_default = 1` werden für neue Aktivitäten automatisch angewandt (ersetzt einfachen teacher_defaults-Mechanismus aus P5a)

### 4. Dashboard-Tab "Meine Vorlagen"

- Liste aller Vorlagen mit Name, Erstelldatum, Default-Markierung
- Vorlagen anlegen, umbenennen, löschen
- Default-Vorlage setzen
- Kurzvorschau der Vorlagen-Inhalte

### 5. Migration aus P5a

- `teacher_defaults`-Zeilen werden zu `teacher_templates`-Einträgen mit `name = 'Standard'` und `is_default = 1` migriert
- Server-Logik für "neue Aktivität → Default-Vorlage laden" bleibt gleich, sucht jetzt nach `is_default = 1`

## Verification

1. Lehrkraft legt zwei Vorlagen an ("Biologie", "Physik")
2. Neue Aktivität öffnen → Default-Vorlage wird automatisch geladen
3. Im Config-Overlay: Dropdown lädt Biologie-Vorlage → Felder befüllt
4. "Als Vorlage speichern" → neue Vorlage erscheint im Dashboard-Tab
5. Dashboard-Tab: Default wechseln → nächste neue Aktivität nutzt neue Default-Vorlage
