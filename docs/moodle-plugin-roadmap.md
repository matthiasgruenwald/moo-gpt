# Moodle-Plugin-Roadmap

Ziel: `moo-gpt` mittelfristig von der aktuellen Architektur mit eigenem Express-Server, eigener SQLite-DB und externen Seiten in ein echtes Moodle-Plugin überführen.

Diese Roadmap ist ein Zukunftsplan. Die offene Security-Diskussion zu S1 wird hier bewusst nicht weiter vertieft, sondern strukturell durch die Zielarchitektur entschärft.

## Warum dieser Schritt

Die aktuelle Architektur trennt:

- Moodle-Seitenaufbau und Nutzer-Session
- Bot-Server und Autorisierung
- Externe Seiten für Dashboard und Konfiguration
- Eigene Datenbank außerhalb von Moodle

Dadurch entstehen Reibung und Sicherheitsdruck an den Systemgrenzen. Ein echtes Moodle-Plugin würde Auth, Rechte, Kontext und Datenhaltung wieder an Moodle anbinden.

## Zielbild

Empfohlenes Zielbild: `mod_moogpt` als echtes Aktivitätsmodul.

Warum `mod_` statt `local_`:

- `moo-gpt` ist fachlich eine kursbezogene Lernaktivität
- Aktivitätskontext, Capabilities, Backup/Restore und Kursintegration passen natürlicher in ein `mod`
- Lehrer-Konfiguration, Teilnehmerkontext und spätere Bewertungs-/Kursbezüge lassen sich sauberer abbilden

Optional ergänzend:

- kleines `local_moogpt` nur dann, wenn systemweite Hilfsfunktionen nötig werden
- separater Streaming-Helfer nur dann, wenn Moodle-seitig kein vertretbarer Ersatz für den heutigen Echtzeitpfad gefunden wird

## Architektur-Zielzustand

```text
Moodle Aktivität mod_moogpt
  -> Moodle Login + Session
  -> Moodle Capabilities im Kurs-/Aktivitätskontext
  -> Plugin-Tabellen in der Moodle-Datenbank
  -> Plugin-Seiten für Aktivität, Lehreransicht und Konfiguration
  -> Plugin-JavaScript im Moodle-Frontend
  -> OpenAI-Anbindung aus dem Plugin heraus
```

## Was aus dem aktuellen Repo wohin wandert

| Heute | Ziel im Plugin |
|---|---|
| `server.js` | PHP-Controller, External Functions, ggf. kleine Service-Klassen |
| `db.js` | Moodle-Tabellen via XMLDB + Zugriff über Moodle-DB-API |
| `public/moo-bot.js` | Moodle-JavaScript-Modul für Chat-UI |
| `public/dashboard.html` / `dashboard.js` | Lehreransicht innerhalb des Plugins |
| `public/config.html` / `config.js` | Aktivitäts- oder Einstellungsseite im Plugin |
| SQLite-Dateien und Token-Caches | Moodle-Datenbank und Moodle-Session-/Capability-Modell |

## Pflichtentscheidungen

Vor einer Umsetzung müssen diese Architekturentscheidungen festgezogen werden:

1. `mod_moogpt` ist der Primärtyp
2. Rechte laufen ausschließlich über Moodle-Capabilities, nicht über eigene Lehrer-/Admin-Tokens
3. Daten liegen in Moodle-Tabellen, nicht mehr in SQLite
4. Lehrer-Dashboard und Konfiguration werden in Moodle-Seiten integriert
5. Der heutige Query-Token-Flow wird nicht mitgenommen
6. Echtzeit wird separat entschieden: AJAX/Polling, SSE-ähnlich oder externer Streaming-Helfer

## Migrationsphasen

## Phase 0 — Scope frieren

Ziel:
- Zielbild festziehen, ohne sofort alles umzubauen

Lieferobjekte:
- Liste der Kernfunktionen, die zwingend in V1 des Plugins enthalten sein müssen
- Liste der Funktionen, die später nachgezogen werden dürfen

Pflicht für V1:
- Aktivität anlegen und konfigurieren
- Schüler-Chat in Moodle
- Lehrerrechte über Moodle-Capabilities
- Zugriff auf Chatverläufe der eigenen Aktivität
- Persistenz in Moodle-DB

Kann später folgen:
- Personas
- One-Click-Optimierung
- Prompt-Historien
- Erkenntnisse, Kriterien, Feedback-Extras
- Live-Dashboard in heutiger Tiefe

## Phase 1 — Plugin-Skelett und Datenmodell

Ziel:
- `mod_moogpt` als installierbares Moodle-Plugin mit minimalen Seiten und Tabellen

Notwendige Bausteine:
- Plugin-Dateistruktur für `mod_moogpt`
- `version.php`
- `db/install.xml`
- `db/access.php`
- Grundseiten für Aktivität und Einstellungen

Datenmodell grob:
- Instanz-Tabelle für Aktivitätskonfiguration
- Threads
- Messages
- Token-/Kosten-Log
- optionale Tabellen für Templates, Personas, Kriterien, Feedback, Historien

Wichtig:
- Nicht alle heutigen Tabellen 1:1 zuerst übernehmen
- Erst das Kernmodell für Aktivität, Thread und Message sauber schneiden

## Phase 2 — Rechte und Kontext

Ziel:
- Autorizierung vollständig an Moodle binden

Umsetzung:
- Capabilities in `db/access.php`
- Lehrer-/Manager-Aktionen nur im passenden Kurs-/Aktivitätskontext
- Keine Lehreridentität mehr aus Browser-Payload, Query-Token oder externer Session ableiten

Beispielhafte Capability-Gruppen:
- Aktivität ansehen/nutzen
- Aktivität konfigurieren
- Schüler-Chats einsehen
- Systemweite Vorlagen oder globale Verwaltung

## Phase 3 — Chat-V1 in Moodle

Ziel:
- Kernpfad des Produkts direkt in Moodle verfügbar machen

Umsetzung:
- Chat-UI als Moodle-JavaScript-Modul
- Aktivitätsdaten serverseitig aus dem Plugin laden
- Nachrichten speichern und wieder laden
- OpenAI-Aufrufe aus Moodle heraus ausführen

Offene Technikfrage:
- Streaming wie heute beibehalten oder für V1 einfacher liefern

Pragmatische Empfehlung:
- Zuerst funktionsfähigen Chat ohne aufwändige Echtzeitarchitektur
- Danach Streaming als separates Optimierungspaket

## Phase 4 — Lehreransicht und Konfiguration

Ziel:
- Externe Seiten `dashboard.html` und `config.html` ablösen

Umsetzung:
- Lehreransicht als Plugin-Seite oder Reiter innerhalb der Aktivität
- Konfiguration direkt im Aktivitätskontext
- Aktivitätsbezogene Einstellungen nicht mehr über externen Flow transportieren

Inhaltlich zuerst:
- Opener
- Upload-Modus
- Bot-Icon/Titel
- Modellauswahl, soweit fachlich weiter gewünscht
- Anzeige der Schüler-Chats der aktuellen Aktivität

## Phase 5 — Erweiterungen nachziehen

Ziel:
- Heutige Zusatzfunktionen nur dann migrieren, wenn das Kernprodukt stabil läuft

Pakete:
- Personas
- Vorlagen-Bibliothek
- One-Click-Optimierung
- Kriterien
- Feedback
- Erkenntnisse
- Prompt-Historien

Regel:
- Jede Zusatzfunktion muss auf Moodle-Capabilities und Moodle-DB aufsetzen
- Keine Rückkehr zu externen Sonderpfaden

## Phase 6 — Ablösung des Alt-Stacks

Ziel:
- Express-Server, SQLite und externe HTML-Seiten ganz oder weitgehend entbehrlich machen

Ergebnis:
- `server.js` wird entweder vollständig abgelöst oder nur noch als klar begrenzter Hilfsdienst für Streaming betrieben
- Externe Dashboard-/Config-Seiten entfallen
- Autorisierung liegt vollständig in Moodle

## Offene Architekturfrage: Echtzeit

Das ist der größte technische Sonderfall.

Option A:
- Kein echtes Token-Streaming in V1
- Antworten blockweise oder in kurzen Polling-Schritten anzeigen

Option B:
- Streaming über einen kleinen Restdienst beibehalten
- Aber Autorisierung und Datenmodell trotzdem in Moodle verankern

Empfehlung:
- Nicht die gesamte Plugin-Migration an der Echtzeitfrage blockieren
- Erst V1 ohne aufwändige Echtzeit sauber machen

## Migrationsstrategie

Empfohlen:

1. Neues Plugin parallel aufbauen
2. Kleine V1 mit Kernpfad liefern
3. Pilotbetrieb mit einer Aktivität oder einem Kurs
4. Erst danach Alt-Stack zurückbauen

Nicht empfohlen:

- Big-Bang-Port aller Features
- Sicherheits- und Streaming-Fragen gleichzeitig lösen wollen
- SQLite-Schema blind 1:1 nach Moodle kopieren

## Minimaler V1-Schnitt

Wenn die Migration realistisch bleiben soll, ist dieser Zuschnitt sinnvoll:

- `mod_moogpt` als Aktivität
- Aktivitätseinstellungen in Moodle
- Schüler-Chat
- Speicherung von Threads und Messages
- Lehreransicht für Chats der aktuellen Aktivität
- Rechte nur über Moodle-Capabilities
- Kein externer Dashboard-Token-Flow

Bewusst nicht in V1:

- Vollständige Übernahme aller Admin-Seiten
- Alle Persona-/Optimierungs-Extras
- Perfektes Echtzeit-Streaming
- Systemweite Sonderverwaltung außerhalb des Kurskontexts

## Vorbereitende Inventur im aktuellen Repo

Vor einem echten Start sollte das bestehende System entlang dieser Linien inventarisiert werden:

- Welche Features sind Pflicht, optional oder historisch gewachsen
- Welche Daten sind produktiv unverzichtbar
- Welche Tabellen/Felder brauchen ein Migrationsskript
- Welche UI-Teile sind Kernprodukt, welche nur Komfort
- Welche OpenAI-Aufrufe müssen in V1 wirklich erhalten bleiben

## Erfolgskriterien

Die Migration ist fachlich gelungen, wenn:

- Schüler und Lehrkräfte ausschließlich über Moodle autorisiert werden
- Aktivitätskonfiguration vollständig im Moodle-Kontext liegt
- Chats und Metadaten in Moodle-Tabellen liegen
- Externe Query-Tokens für Lehrer-/Admin-Zugriff verschwunden sind
- Der Kernpfad ohne separate Dashboard-/Config-Seiten funktioniert

## Nächster sinnvoller Planungsschritt

Falls diese Roadmap später aktiviert wird:

1. V1-Featureliste endgültig kürzen
2. Ziel-Datenmodell für `mod_moogpt` skizzieren
3. Capabilities und Rollenmodell festlegen
4. Entscheidung zur Echtzeitfrage treffen
5. Erst dann mit Plugin-Skelett starten
