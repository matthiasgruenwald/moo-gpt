# ADR 0008 – `resolveWidgetConfig` als einzige Auflösungs- und Validierungs-Seam

**Status:** Akzeptiert
**Datum:** 2026-06-06
**Bezug:** Plugin-Prep-Plan A1 (`docs/plans/2026-05-31-plugin-prep-architecture.md`), ADR 0004, ADR 0007, Moodle-Plugin-Roadmap Pflichtentscheidung #4

## Kontext

Die Widget-Konfiguration wird auf drei Ebenen definiert (Systemvorlage → Lehrer-Vorlage → Aktivität). Mit Issue #168/#192 wurde `services/widget-config-resolver.js` als einheitlicher Laufzeit-Resolver dieser Kaskade eingeführt.

Beim Thermo-Nuclear-Review (2026-06-06) traten zwei Reste der alten, verteilten Auflösung zutage:

1. **`model-resolver.js` lebte parallel weiter.** Es löste `model`/`assist_model` mit einer **flacheren, abweichenden** Kaskade auf (Aktivität → globaler Default; Lehrer- und Systemvorlage übersprungen). Einziger verbliebener Aufrufer war die Anzeige in `routes/activity.js`. Damit konnte dieselbe Config-Seite ein anderes „effektives Modell" anzeigen, als der Bot tatsächlich nutzt — genau der Divergenz-Bug, den A1 beseitigen sollte.

2. **Die Validierung war positionsbasiert und lückenhaft.** `validateWidgetConfig()` nahm 8 Positionsargumente; mehrere Routen lieferten nur die ersten vier und schrieben `audio_output`/`tts_voice`/`audio_student_options` **ungeprüft** in Vorlagen-Tabellen.

## Entscheidung

`resolveWidgetConfig(activityId, userId)` ist die **einzige** Stelle, die die Widget-Konfigurationskaskade auflöst. Die Validierung erfolgt über **einen** objektförmigen Contract (`validateWidgetConfig(cfg, { availableModels, allowedBotIcons })`), der jedes vorhandene Feld prüft, unabhängig von der Aufrufreihenfolge.

Konkret:

- `model-resolver.js` entfällt. `getEffectiveModel`/`getEffectiveAssistModel`-Aufrufer lesen `cfg.model` / `cfg.assistModel` aus `resolveWidgetConfig`.
- Validierung nimmt ein Objekt in der Form, die der Resolver zurückgibt — kein Feld kann beim Aufruf „vergessen" werden.

## Alternativen

- **`model-resolver.js` behalten, Kaskade angleichen:** Behebt die Divergenz, lässt aber zwei Quellen der Wahrheit bestehen — gegenläufig zum Eine-Seam-Ziel der Plugin-Roadmap.
- **Nur die Validierungslücke an den Callsites schließen:** Schließt das Loch, konserviert aber die Positions-API und das dreifach kopierte Validierungs-Boilerplate.

## Konsequenzen

- **Plugin-Port:** Beim Umbau zu `mod_moogpt` wird genau **eine** Funktion durch eine Moodle-DB-Variante ersetzt; die External-Functions haben **einen** Validierungs-Contract am Eingang.
- ADR 0004 (Modell-Auflösung) geht in dieser Seam auf — siehe Statushinweis dort.
- Neue Felder werden an einer Stelle ergänzt (Resolver + Contract) statt über mehrere Routen verteilt.
</content>
</invoke>
