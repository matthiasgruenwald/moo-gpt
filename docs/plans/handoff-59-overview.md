# Übersicht: Werkzeug-Kosten (#59) — Implementierungs-Plan

**PRD:** Issue #59  
**Erstellt:** 2026-05-24  
**Status:** Bereit für Umsetzung

## Wellen-Struktur

### 🌊 Wave 1 — Foundation

| Issue | Titel | Handoff |
|-------|-------|---------|
| #60 | ai-client Breaking Change: textCall/jsonCall → {text, usage} | [handoff-59-60](handoff-59-60-ai-client-breaking-change.md) |
| #61 | DB-Migration: token_log.call_type + activities.teacher_id | [handoff-59-61](handoff-59-61-db-migration.md) |
| #62 | CostService-Modul | [handoff-59-62](handoff-59-62-cost-service.md) |

**HITL nach Wave 1:** Bestehende Funktionen laufen noch (Widget, Dashboard-Chatliste, Prompt-Assistent)

### 🌊 Wave 2 — Backend-Integration

| Issue | Titel | Handoff |
|-------|-------|---------|
| #63 | Teacher-Attribution beim /dashboard/chats-Zugriff | [handoff-59-63](handoff-59-63-teacher-attribution.md) |
| #64 | Live-Summary Cost Recording | [handoff-59-64](handoff-59-64-live-summary-cost.md) |
| #65 | Prompt-Assistent Cost Recording | [handoff-59-65](handoff-59-65-prompt-assistent-cost.md) |
| #66 | Criteria + Optimize + Persona Cost Recording | [handoff-59-66](handoff-59-66-criteria-optimize-persona-cost.md) |
| #67 | Simulation Cost Recording | [handoff-59-67](handoff-59-67-simulation-cost.md) |
| #68 | Neue Cost-API-Endpunkte | [handoff-59-68](handoff-59-68-cost-api-endpoints.md) |

**HITL nach Wave 2:** Werkzeuge im Dashboard aufrufen → DB-Einträge prüfen → API-Endpunkte testen (curl)

### 🌊 Wave 3 — Frontend

| Issue | Titel | Handoff |
|-------|-------|---------|
| #69 | Kopfzeile Cost-Summary auf /dashboard/chats | [handoff-59-69](handoff-59-69-kopfzeile-cost-summary.md) |
| #70 | Inline-Kosten in Werkzeug-Panels | [handoff-59-70](handoff-59-70-inline-kosten-panels.md) |
| #71 | /dashboard/costs Seite — Teacher View | [handoff-59-71](handoff-59-71-costs-page-teacher.md) |
| #72 | Admin-Sektion in /dashboard/costs | [handoff-59-72](handoff-59-72-costs-page-admin.md) |

**HITL nach Wave 3:** Vollständiger UI-Fluss — Kosten in Panels, Kopfzeile, Kosten-Seite, Admin-Ansicht

## Prozess für jedes AFK-Issue

1. Handoff-Doc lesen
2. `/karpathy-guidelines` aktivieren
3. Relevante Dateien lesen (nicht raten)
4. `/tdd` nutzen: Test → Impl → Refactor
5. Erkenntnisse als Kommentar auf das Issue schreiben

## Abhängigkeits-Graph

```
#61 ──► #62 ──► #63, #64, #65, #66, #67, #68
#60 ──► #64, #65, #66, #67
#68 ──► #69, #70, #71
#64 ──► #70
#65 ──► #70
#71 ──► #72
```
