# ADR 0009 — `local_ai_task_guide` als eigenes Repo, moo-gpt als lebende Referenz

**Status:** Akzeptiert
**Datum:** 2026-06-07
**Bezug:** PRD `docs/plans/prd-local-ai-task-guide-aufgabenbot.md`, Moodle-Plugin-Roadmap (`docs/moodle-plugin-roadmap.md`), ADR 0007, ADR 0008

## Kontext

Die bisherige Roadmap (vgl. ADR 0007) rahmte die Moodle-Zukunft als **Port** von moo-gpt nach `mod_moogpt`. Der PRD kippt diese Prämisse: V1 wird ein **eigenständiges Moodle-Zusatzplugin** `local_ai_task_guide` (Anzeigename **KI-Aufgabenbegleiter**), das auf Moodle-Infrastruktur plus `local_ai_manager` und `block_ai_chat` aufsetzt — kein Fork des allgemeinen Chatblocks, kein Aktivitätsmodul.

Harte Grundlage: moo-gpt ist Node.js (Express, better-sqlite3, `openai`-SDK, WebSocket). Ein Moodle-Plugin ist PHP (Controller, External Functions, XMLDB, Capabilities) plus AMD-JS im Frontend. Backend-Code ist damit **nicht** sprachübergreifend teilbar. moo-gpt läuft zugleich produktiv als Pilot (`gpt.gruenwald.fun`) und entwickelt sich über die Plugin-Bauphase (mehrere Wochen) weiter.

## Entscheidung

1. **Eigenes Repo.** `local_ai_task_guide` entsteht in einem neuen, eigenständigen Plugin-Repo — **kein** Monorepo, **kein** moo-gpt-Fork. Moodle-Plugin-Repos müssen an festem Pfad mit fester Struktur installierbar sein (Repo-Root = Plugin); ein Monorepo bräche Install und Plugin-Validator. Der laufende Pilot bleibt im moo-gpt-Repo ungestört.

2. **moo-gpt = lebende Referenz, nicht statische Prior Art.** moo-gpt ist die **Source of Truth** für Verhalten, Prompts und Algorithmen des geteilten didaktischen Kerns und darf sich weiterentwickeln. Das neue Repo liest moo-gpt **live, read-only** ein über `permissions.additionalDirectories: ["../moo-gpt"]` (relativ → universell auf LXC und Laptop bei Sibling-Layout); `Edit`/`Write` auf `../moo-gpt/**` werden per `deny` blockiert. Pilot dadurch beweisbar unberührbar.

3. **Übertragung = Wissen, nicht Module (Anti-Drift).** Backend ist PHP-Neubau. Seed-Docs im neuen Repo halten **nur** plugin-eigenes Neues (Aufgabenprofil-State-Machine, Capability-/Rollen-Mapping, Kontextdiagnose-Spec). moo-gpt-abgeleitetes Material (Prompts, PDF→Bild, Upload-Validierung, Summary-Flow) wird beim Portieren **live gelesen**, nicht dupliziert.

4. **V1-Scope eingefroren am PRD.** „Annähernd moo-gpts Funktionsumfang" ist **kein** V1-Ziel. Neue moo-gpt-Features fließen **nicht automatisch** in V1 — Aufnahme nur manuell angestoßen, sonst V2+-Backlog.

5. **Bug-Carry-over nur im geteilten Kern.** Bugs in der vom Plugin nachgebauten Logik werden mitgenommen; Live-Read liefert neu portierten Features den gefixten Stand automatisch. Für **bereits portierte** Features gilt ein leichtgewichtiger Parity-Check (Issue/Label), wenn ein Bug erst später in moo-gpt auffällt. Out-of-scope-Subsysteme (Simulation, Cost-Dashboard, Audio, Memory) sind ausgenommen.

## Was Moodle/Plugins liefern (nicht neu zu bauen)

Token-Auth/Origin-Checks → Moodle-Session + Capabilities · `db.js`/Migrations/Stores → Moodle DB-API + XMLDB · OpenAI-Client/Pricing/Token-Log → `local_ai_manager` · Cost-Dashboard → entfällt · Chat-UI → `block_ai_chat`-Muster · DOM-Scraping → server-seitige Moodle DB/File-API · Identität → `$USER`/`$cm`/Kurs-Kontext.

**Genuin net-new (didaktischer Kern):** Aufgabenprofil-State-Machine, Aktivitätskontext-Extraktion (PHP), Kontextdiagnose (grün/gelb/rot), Upload-Validierung/PDF→Bild, Aufgabenbot-Conversation-Store, Unterrichts-Zusammenfassung, `Prüfen & verbessern`, Plenumsmodus, AI-Manager-Adapter — plus der gating **AI-Manager-Bild-Spike**.

## Alternativen verworfen

- **Monorepo (moo-gpt + Plugin nebeneinander):** Bricht den Moodle-Standard-Install (Repo-Root muss das Plugin sein); der Sprachgrenze wegen ohnehin kein Code-Reuse.
- **Fork von moo-gpt:** Erbt JS-Historie und riskiert den laufenden Pilot.
- **Statische Prior-Art-Kopie statt Live-Read:** Läuft über Wochen gegenüber dem sich entwickelnden Pilot auseinander (Drift).
- **Node-Microservice statt PHP fürs Backend:** Verworfen — hält eine zweite Sprache/Deployment am Leben, ohne den Plugin-Vorteil (Moodle-Infra) zu nutzen.

## Konsequenzen

- ADR 0007 (Port-Rahmung „`mod_moogpt`") wird durch diese Entscheidung überholt; die Auth-Seam-Aussage bleibt gültig, das Zielartefakt ändert sich zu `local_ai_task_guide`.
- Die Plugin-prep-Refactors aus der ersten Architektur-Review (Client-Moodle-Kontext-Adapter, getDb-DI) sind hinfällig — sie bereiteten einen Port vor, der nicht stattfindet.
- Cross-Repo-Lesezugriff wird über `.claude/settings.json` des neuen Repos konfiguriert; exakte Glob-Syntax beim Anlegen verifizieren.
- moo-gpt wird über die Plugin-Bauphase weiter als Pilot gewartet; Bugfixes im geteilten Kern lösen Plugin-Parity-Checks aus.
- Repo-Platzierung dieses ADR: moo-gpt, weil die Entscheidung „moo-gpt = lebende Referenz, nicht Port" eine moo-gpt-Aussage ist; sie wird ins neue Repo gespiegelt.

## Nachtrag 2026-06-07 — Referenzzugriff über GitHub statt lokalem Sibling-Read

Entscheidung 2 (Live-Read über `permissions.additionalDirectories: ["../moo-gpt"]` + `deny` auf Schreiben) wird ersetzt:

- **Referenzquelle ist `origin/dev` von moo-gpt via git** (`git fetch` + `git show origin/dev:<pfad>`), nicht der lokale Sibling-Arbeitsbaum.
- **Vorteile:** maschinenunabhängig (kein Sibling-Layout LXC≠Laptop), **kein Schreibweg zum Pilot** (sicherer als `deny`-Regeln), Portierung erfolgt aus stabilen, gepushten Commits.
- **Trade-off:** nur **gepushter** Stand sichtbar. Disziplin: moo-gpt-Änderungen werden nach `dev` gepusht; `origin/dev` ist die Wahrheit.
- **Folge für die Topologie:** Der Sibling-Zwang entfällt → die Plugin-Arbeitskopie muss **nicht** neben moo-gpt liegen. Sie zieht auf die **Moodle-Test-LXC** um (editieren + bind-mount + testen an einem Ort); moo-gpt wird dort per `git fetch` aus GitHub gelesen. `additionalDirectories` und die `deny`-Regeln aus Entscheidung 2 / Skeleton-Schritt 1 **entfallen ersatzlos**.
- **Pilot-LXC:** unberührt; die dortige `/opt/local_ai_task_guide`-Arbeitskopie wird nach dem Umzug überflüssig (GitHub hält den Stand).
