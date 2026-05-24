# Handoff: Admin-Sektion in /dashboard/costs

**Issue:** #72  
**Wave:** 3 (Frontend)  
**Blocked by:** #68 (Cost-API-Endpunkte), #71 (/dashboard/costs Seite muss existieren)

## Kontext

Erweiterung der bestehenden `/dashboard/costs`-Seite (#71) um eine Admin-only-Sektion oben: aufklappbare Lehrer-Übersicht mit Navigation in die Aktivitäts-Detailliste.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `/dashboard/costs`-Seitencode | Hier die Admin-Sektion einfügen (nach #71) |
| `auth-middleware.js` | Admin-Check-Pattern — wie andere Seiten es lösen |
| `docs/dashboard.md` | Admin-Sichten in bestehenden Seiten als Vorlage |

**Achtung:** Issue-Kommentar von #71 lesen — dort dokumentiert der Vorgänger-Agent die Dateistruktur.

## Admin-Sektion (aus `GET /api/admin/costs`)

```
[Lehrer-Übersicht] — nur für Admin sichtbar
  ▼ Frau Müller             | Chats: 1,20 € | Werkzeug: 0,80 € | Gesamt: 2,00 €
    Aktivität "Lesetext 5a" | Chats: 0,80 € | Werkzeug: 0,50 € | 1,30 €  [→ Detailansicht]
    Aktivität "Quiz 7b"     | ...
  ▼ Unbekannt               | ...  (teacher_id = NULL)
```

## Wichtige Constraints

- Admin-Erkennung: bestehende Pattern aus anderen Dashboard-Seiten übernehmen (nicht neu erfinden)
- Klick auf Aktivität: Aktivitäts-Selektor übernehmen + Detailliste (untere Sektion) aktualisieren
- Normale Lehrkräfte sehen die Sektion NICHT — serverseitig prüfen (Admin-Endpoint gibt 401) und clientseitig ausblenden
- `teacher_id = NULL` → Gruppe „Unbekannt"

## Testansatz

Manueller Smoke-Test:
- Als Admin einloggen → Sektion erscheint
- Als Lehrkraft einloggen → Sektion fehlt (auch kein leeres Element im DOM)
- Aktivität anklicken → Detailliste aktualisiert sich

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- Issue-Kommentar #71 lesen vor dem Start (Seitenstruktur)
- Admin-Pattern aus bestehenden Seiten lesen — nicht neu erfinden
- Erkenntnisse als Kommentar auf Issue #72
