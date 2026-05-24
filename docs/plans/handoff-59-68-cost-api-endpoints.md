# Handoff: Neue Cost-API-Endpunkte

**Issue:** #68  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #61 (DB-Schema), #62 (CostService)

## Kontext

Drei neue read-only GET-Endpunkte. Sie werden von Wave-3-Frontend-Slices (#69, #70, #71, #72) genutzt. Können implementiert werden sobald CostService (#62) existiert — unabhängig davon ob Wave-2-Route-Slices (#64–#67) fertig sind (Daten werden dann einfach leer sein).

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `cost-service.js` | Alle 3 Endpunkte delegieren hierhin (nach #62) |
| `routes/` | Passendes Modul finden oder `routes/costs.js` erstellen |
| `server.js` | Router registrieren |
| `auth-middleware.js` | `requireDashboardAuth` und `requireAdminAuth` importieren |
| `test/prompt-check.test.js` | Testvorlage: bypassAuth-Option |

## Endpunkte

```
GET /api/activity/:activityId/cost-summary
  → { chatEur, werkzeugEur, totalEur }
  Auth: requireDashboardAuth

GET /api/activity/:activityId/werkzeug-log
  → [{ id, createdAt, callType, callTypeLabel, model, promptTokens, completionTokens, costEur }]
  Auth: requireDashboardAuth

GET /api/admin/costs
  → [{ teacherId, teacherName, activities: [{ activityId, activityName, chatEur, werkzeugEur, totalEur }] }]
  Auth: requireAdminAuth
```

## Wichtige Constraints

- `callTypeLabel` (deutsches Label) kommt aus `getWerkzeugLog` — nicht im Endpoint selbst mappen
- Wenn Preisdaten fehlen: Kosten-Felder als `null` (nicht Fehler, nicht 0)
- Admin-Endpoint: 401 ohne Admin-Session — Integration-Test dafür schreiben

## Testansatz

Integration-Tests:
- `cost-summary` gibt korrekte Struktur zurück
- `werkzeug-log` gibt korrekte Liste (mit und ohne Einträge)
- Admin-Endpoint gibt 401 ohne Admin-Auth, 200 mit Admin-Auth

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen
- Routing-Pattern aus bestehenden Routes übernehmen (nicht neu erfinden)
- Ergebnisse / Endpunkt-URLs als Kommentar auf Issue #68 (Frontend-Slices brauchen sie)
