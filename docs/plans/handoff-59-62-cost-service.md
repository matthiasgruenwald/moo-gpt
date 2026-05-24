# Handoff: CostService-Modul

**Issue:** #62  
**Wave:** 1 (Foundation)  
**Blocked by:** #61 (DB-Schema muss `call_type` und `teacher_id` enthalten)

## Kontext

Neues Modul `cost-service.js` kapselt alle Kosten-Operationen. Wird von Wave-2-Slices (#64–#67) und den neuen API-Endpunkten (#68) importiert. Reine Logik — kein HTTP-Bezug (analog zu `criteria.js`, `optimize.js`).

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `token-log.js` | Bestehende Kosten-Berechnungslogik (nicht duplizieren, referenzieren) |
| `db.js` | DB-Zugang — wie andere Module ihn nutzen |
| `criteria.js` | Vorlage: reines Logik-Modul ohne HTTP |
| `test/prompt-check.test.js` | Testvorlage: node:test, In-Memory-SQLite oder DB-Mock, DI-Pattern |
| `docs/adr/0001-werkzeug-kosten-in-token-log.md` | call_type-Werte und Query-Konventionen |

## Zu exportierende Funktionen

```js
recordWerkzeugUsage(activityId, callType, model, usage)
getCostSummary(activityId)        // → { chatEur, werkzeugEur, totalEur }
getWerkzeugLog(activityId)        // → [{ id, createdAt, callType, callTypeLabel, model, ... }]
getAdminCostsByTeacher()          // → [{ teacherId, teacherName, activities: [...] }]
```

Bekannte call_type-Werte und deutsche Labels: in Issue #59 unter „Anzeige-Labels" nachschlagen.

## Wichtige Constraints

- Chat-Queries nutzen `WHERE call_type IS NULL` — nie beides mischen
- Kosten-Berechnung: bestehende Logik aus `token-log.js` wiederverwenden
- `getWerkzeugLog` gibt `callTypeLabel` (deutsches Label) direkt zurück — nicht im Frontend berechnen

## Testansatz

Vorlage: `test/prompt-check.test.js` — In-Memory-SQLite (`:memory:`), keine HTTP-Mocks nötig.

- `recordWerkzeugUsage`: schreibt Eintrag mit korrektem `call_type`
- `getCostSummary`: Chat (NULL) und Werkzeug-Kosten korrekt getrennt summiert
- `getWerkzeugLog`: filtert korrekt nach `activityId` und `call_type IS NOT NULL`
- `getAdminCostsByTeacher`: gruppiert korrekt

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen: Tests zuerst, dann Implementierung
- Ergebnisse / API-Design-Erkenntnisse als Kommentar auf Issue #62
