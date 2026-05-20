# Cleanup / Code-Struktur – Strategie

Branch: `cleanup/code-struktur`

Fünf chirurgische Aufräum-Schritte, die aus dem Architecture-Assessment (2026-05-19) hervorgegangen sind. Kein UI-Change, keine Verhaltensänderung — nur Strukturverbesserungen.

---

## Leitprinzip

Gleiche Reihenfolge wie beim DB-Refactoring: kleinste, sicherste Änderung zuerst. Jeder Schritt hinterlässt einen konsistenten, testbaren Zustand.

---

## Schritte

| Schritt | Datei | Problem | Lösung | Status |
|---------|-------|---------|--------|--------|
| 01 | `routes/validators.js` | Liegt in `routes/`, wird aber von Domain-Code benötigt. Abhängigkeitsrichtung verkehrt. | → Root `validators.js`, Funktion umbenannt | ✓ done |
| 02 | `criteria.js` | Greift selbst in Store (`getActiveErfahrungsprompt`), statt Daten entgegenzunehmen. | Store-Zugriff an Caller delegieren | ✓ done |
| 03 | `optimize.js` | Greift selbst in drei Stores. | Store-Zugriffe an Caller delegieren | |
| 04 | `routes/simulation.js` | `selectPersonasForOneClick()` (50 Zeilen Domain-Heuristik) steckt im Route-Handler. | → `persona-selector.js` | ✓ done |
| 05 | `server.js` / `routes/activity.js` | Aktivitätssperren als rohes `Map` in `server.js`, direkt aus Route manipuliert. Timer und Broadcasts verteilt. | → `lock-manager.js` | |

---

## Was nicht in dieser Branch

- `config-cache.js` — für Single-Instance-Deployment ohne echtes Problem (Node.js Event-Loop, synchrones better-sqlite3)
- Visuelle UI-Änderungen — das ist eine eigene Branch nach diesem Cleanup
- `dashboard.js` / `moo-bot.js` Modularisierung — spätere Phase

---

## Ablauf pro Schritt

1. Handoff-Datei lesen → Umsetzung in eigener Session
2. `/karpathy-guidelines` aktivieren: chirurgisch vorgehen, keine ungefragten Extras
3. Bei unerwarteten Designentscheidungen während der Umsetzung: `/grill-with-docs` zur Klärung und Dokumentation in `CONTEXT.md`
4. Matthias testet die UI-Funktionen aus dem `## Testen`-Abschnitt
5. Bei OK: `git add`, `git commit`, `git push` durch Matthias oder Claude

---

## Teststrategie

Diese Branch ist reines Refactoring — kein neues Verhalten. Deshalb:

- **Kein TDD-Zyklus** (red-green-refactor setzt neue Funktionalität voraus)
- **Stattdessen:** Vor jedem Schritt alle betroffenen Caller per `grep` identifizieren, nach dem Schritt UI-Test aus dem `## Testen`-Abschnitt durchführen
- `/karpathy-guidelines` gilt für jeden Schritt: keine ungefragten Umstrukturierungen, keine Scope-Erweiterung, minimale Diff

Smoke-Test am Ende von Schritt 05: vollständiger Durchlauf (Chat, Dashboard, Simulation, Sperre).
