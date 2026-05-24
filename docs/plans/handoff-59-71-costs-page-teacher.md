# Handoff: /dashboard/costs Seite — Teacher View

**Issue:** #71  
**Wave:** 3 (Frontend)  
**Blocked by:** #68 (Cost-API-Endpunkte)

## Kontext

Neue Seite `/dashboard/costs` mit Nav-Tab, Aktivitäts-Selektor und Detailliste der Werkzeug-Aufrufe. Teacher-View (Admin-Erweiterung kommt in #72).

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `routes/dashboard-pages.js` | Neue Route `/dashboard/costs` registrieren |
| `public/dashboard/` | Neue HTML/JS-Datei für die Seite |
| Bestehende Dashboard-Seite (z.B. chats) | Vorlage für Nav-Tab + Aktivitäts-Selektor |
| `docs/dashboard.md` | Nav-Bar-Struktur, bestehende Seiten als Referenz |

**Achtung:** Dateinamen und Nav-Bar-Integration vor dem Start durch Lesen der bestehenden Seiten verifizieren.

## Seitenstruktur

```
[Nav-Bar mit Tab "Kosten" aktiv]
[Aktivitäts-Selektor — wie auf /dashboard/chats]
[Tabelle: Zeitstempel | Typ | Modell | Eingabe-Token | Ausgabe-Token | Kosten €]
  - Neuester Eintrag oben
  - null-Kosten als "–"
  - Leere Liste: "Noch keine Werkzeug-Aufrufe für diese Aktivität"
```

## Wichtige Constraints

- Aktivitätswechsel aktualisiert Tabelle (kein Seitenreload)
- `callTypeLabel` kommt direkt aus der API (kein Frontend-Mapping nötig)
- Kein Admin-Inhalt in diesem Slice — #72 fügt es hinzu
- URL-Parameter `?activityId=X` wie auf `/dashboard/chats`

## Testansatz

Manueller Smoke-Test:
- Nav-Tab "Kosten" anklicken → Seite lädt
- Aktivität wählen → Tabelle füllt sich
- Aktivität wechseln → Tabelle aktualisiert sich
- Aktivität ohne Werkzeug-Aufrufe → Hinweistext statt leerer Tabelle

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- Bestehende Seite (z.B. `/dashboard/chats`) als strukturelle Vorlage nutzen
- Erkenntnisse (Nav-Bar-Pattern, Seitenstruktur) als Kommentar auf Issue #71 — #72 braucht sie
