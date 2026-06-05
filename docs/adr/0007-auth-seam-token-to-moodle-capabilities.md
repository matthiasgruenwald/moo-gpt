# ADR 0007 — Auth-Seam: Token-Map zu Moodle Capabilities

**Status:** Akzeptiert  
**Datum:** 2026-06-01  
**Issue:** #170

---

## Kontext

`auth-middleware.js` ist die einzige Auth-Seam im Projekt. Sie verwaltet eine In-Memory-Map (`dashboardTokens`), die temporäre Token für den Dashboard-Zugriff erzeugt und validiert. Token werden beim `init`-Handshake im Chat-Widget erzeugt (`generateDashboardToken`) und über die WebSocket-Verbindung an das Dashboard weitergeleitet.

Die Moodle-Plugin-Roadmap (`docs/moodle-plugin-roadmap.md`) benennt unter Pflichtentscheidung #2 und #5:

- **#2:** Rechte laufen ausschließlich über Moodle-Capabilities, nicht über eigene Lehrer-/Admin-Tokens
- **#5:** Der heutige Query-Token-Flow wird nicht mitgenommen

Bisher fehlt eine explizite Dokumentation, welche heutigen Auth-Funktionen beim Plugin-Port durch welche Moodle-Äquivalente ersetzt werden, und warum `auth-middleware.js` bis dahin nicht weiter abstrahiert werden soll.

---

## Entscheidung

`auth-middleware.js` ist die einzige Datei, die beim Plugin-Port im Auth-Bereich vollständig ausgetauscht wird. Die `dashboardTokens`-Map ist die Auth-Seam: sie wird beim Moodle-Port ersatzlos durch Moodle-Capabilities und Moodle-Sessions abgelöst. Bis zur Plugin-Migration wird `auth-middleware.js` nicht weiter abstrahiert und kein DI-Umbau vorgenommen.

---

## Mapping: heutige Funktion → Plugin-Äquivalent

| Heutige Funktion | Plugin-Äquivalent |
|---|---|
| `requireTeacherAuth` | `require_capability('mod/moogpt:viewdashboard', $context)` |
| `requireDashboardAuth` | Moodle-Session + Capability-Check im Aktivitätskontext |
| `requireAdminAuth` | `require_capability('mod/moogpt:admin', $context)` |
| `generateDashboardToken` | entfällt vollständig — kein externer Token-Flow mehr |
| `checkOriginWs` | Moodle-Session-Cookie im WS-Handshake |

---

## Begründung

**Kein DI-Umbau vor der Plugin-Migration (YAGNI):** Es gibt aktuell keinen zweiten Auth-Adapter und keinen konkreten Bedarf, `auth-middleware.js` hinter einem Interface zu verstecken. Der einzige Abnehmer der Abstraktion wäre der zukünftige Moodle-Port — und der tauscht die gesamte Datei aus, nicht nur einzelne Funktionen. Ein Interface bringt hier keinen Mehrwert und würde früher toten Code erzeugen.

**Klare Bruchlinie:** Weil alle fünf Auth-Funktionen in einer einzigen Datei liegen, ist beim Plugin-Port sofort klar, was wegfällt. Ein verteiltes Auth-Modell hätte diese Klarheit nicht.

---

## Alternativen verworfen

**Auth hinter einem Interface abstrahieren (Strategy/Adapter-Pattern):** Würde die heutige Datei durch eine Schnittstelle und zwei Implementierungen (Token-Map, Moodle-Capabilities) ersetzen. Da nur ein Adapter je existiert, wäre das Indirektion ohne Nutzen. YAGNI.

**Token-Map durch eine externe Session-Bibliothek ersetzen:** Würde die technische Schuld reduzieren, aber den Plugin-Port nicht vereinfachen — Moodle ersetzt die Session vollständig und kennt keine externe Bibliothek.

---

## Konsequenzen

- `auth-middleware.js` wird bis zur Plugin-Migration nicht weiter angefasst (außer bei Bugfixes).
- Beim Plugin-Port ist `auth-middleware.js` die einzige Datei, die im Auth-Bereich komplett ersetzt wird.
- Die Capabilities `mod/moogpt:viewdashboard` und `mod/moogpt:admin` müssen in `db/access.php` des Plugins definiert werden (Phase 2 der Roadmap).
- `generateDashboardToken` und der zugehörige `init`-Handshake entfallen beim Plugin-Port ohne Ersatz.
- Referenzen: Roadmap-Pflichtentscheidungen #2 und #5 (`docs/moodle-plugin-roadmap.md`).
