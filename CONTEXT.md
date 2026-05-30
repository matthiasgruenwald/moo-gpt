# moo-gpt – Domain-Glossar

Kanonische Fachbegriffe für dieses Projekt. Neue Konzepte werden hier eingetragen, sobald sie im Gespräch geklärt sind.

---

## Aktivität

Eine Moodle-Aktivität (Textseite oder Aufgabe), in die ein Chat-Widget eingebettet ist. Jede Aktivität hat eine eindeutige `activityId` und eine eigene Widget-Konfiguration. Wird einer Lehrkraft zugeordnet (`teacher_id` in `activities`-Tabelle), sobald die Lehrkraft das Dashboard für diese Aktivität öffnet. Ermöglicht Admin-seitige Kosten-Aufschlüsselung nach Lehrer.

## Widget-Konfiguration

Die konfigurierbaren Felder, die das Verhalten und Erscheinungsbild des Chat-Bots für eine Aktivität festlegen: `botTitle`, `botIcon`, `uploadMode`, `opener`, `audioInput`, `audioOutput`, `ttsVoice`, `audioStudentOptions`, `model`, `hints`. Wird auf drei Ebenen definiert — Systemvorlage → Lehrer-Vorlage → Aktivitätskonfiguration — wobei jede Ebene die darüber überschreibt. Das GPT-Modell wird **pro Aktivität** gespeichert (Spalte `model` in `activities`), nicht mehr als Lehrer-weite Präferenz. Priorität: Aktivitäts-Modell → System-Prompt-Modell (Admin) → `MODEL_NAME`-Env. Die `teacher_preferences.preferred_model`-Spalte entfällt.

**Config-Overlay-Öffnungsverhalten:** Das Config-Overlay öffnet sich immer auf der **gegenüberliegenden Seite** des Chat-Fensters. Ist das Chat-Fenster rechts → Overlay links angedockt (`left-side`). Ist das Chat-Fenster links → Overlay rechts. Ist das Chat-Fenster geschlossen, öffnet es sich im Standard-Modus (rechts). Der ⇔-Button im Overlay-Header erlaubt jederzeit das Umschalten.

**Schließen-Warnung (Dirty State):** Beim Klick auf das X im Config-Overlay wird geprüft, ob sich seit dem Öffnen des Overlays irgendein Feld geändert hat (Snapshot aller Felder beim Öffnen). Wurde etwas geändert und nicht gespeichert, erscheint eine kurze Warnung. Ziel: verhindert, dass Lehrkräfte ungespeicherte Änderungen versehentlich verlieren, was Unterrichtszeit kostet.

## Systemvorlage

Vom Admin festgelegte Standardwerte für die Widget-Konfiguration. Gilt für Lehrkräfte, die noch keine eigene Lehrer-Vorlage gesetzt haben.

## Lehrer-Vorlage

Von einer Lehrkraft festgelegte Standardwerte für die Widget-Konfiguration. Überschreibt die Systemvorlage und gilt als Ausgangswert für neue Aktivitäten dieser Lehrkraft.

## Aufgabenprompt

Aktivitätsspezifischer Prompt, der das Verhalten des Bots für eine konkrete Aufgabe steuert. Früher zweigeteilt in „hints" (Widget-Konfiguration) und „Erfahrungsprompt" (nachträgliche Korrektur aus Unterrichtserfahrung) — beide Konzepte sind zusammengeführt. Im Code noch als `erfahrungsprompt` benannt; kanonisch heißt es jetzt **Aufgabenprompt**. Wird automatisch in den Prompt-Stack eingebunden. Änderungen über die Aktivitätsseite (`config.html`) und über das Dashboard erzeugen beide einen Versions-Eintrag in der Versionshistorie.

## Persona

Profil eines fiktiven Schülers (Name, Beschreibung, Beispieläußerungen), das für Simulationen genutzt wird. Kann global (Admin), lehrerspezifisch oder aus echten Schüler-Chats generiert werden.

## Simulation

Automatisierter Testlauf: Eine Persona generiert synthetische Äußerungen, der aktuelle Prompt-Stack antwortet, jede Antwort wird anhand von Kriterien bewertet. Ergebnis: Simulations-Paare (Äußerung + Antwort + Bewertung).

## Kriterien

Prüfbare Aussagen, anhand derer KI-Antworten in einer Simulation bewertet werden. Werden aus dem Prompt abgeleitet oder manuell definiert.

## Erkenntnis

Aus Simulations-Ergebnissen destillierte Beobachtung, die in zukünftigen Optimierungsvorschlägen berücksichtigt wird.

## One-Click-Optimierung

Automatisierter Ablauf: Kriterien vorschlagen → mehrere Personas parallel simulieren → Erfahrungsprompt-Verbesserungsvorschlag generieren. Wird als SSE-Stream ausgeliefert.

## Plenumsphase

Zustand, in dem der Chat für alle Schüler einer Aktivität gesperrt ist. Wird vom Lehrer ausgelöst, optional mit automatischer Entsperrung nach N Minuten.

## Schüler-Memory

Schülerspezifische Präferenzen und Wünsche, die als unsichtbare Instruktion in den Systemprompt eingebunden werden. Entsteht aus Schüler-Feedback (Daumen-Button + Freitext im Widget) oder aus Lehrer-Eingabe im Dashboard. **Global gespeichert** — gilt für alle Aktivitäten, nicht pro Aktivität. Wird per Schüler-ID in der Tabelle `student_memory` abgelegt (ohne `activity_id`). Enthält neben dem Freitext `preference_text` auch strukturierte Präferenzen: `preferred_voice` (Stimme für TTS) und `tts_autoplay` (Bot-Antworten automatisch vorlesen). Schüler können ihren eigenen Memory-Text und ihre Stimmwahl über Bedienelemente im Widget einsehen und ändern; Lehrkräfte können den Memory-Text im Dashboard anzeigen, bearbeiten und löschen. Ermöglicht Differenzierung ohne expliziten Aufwand für die Lehrkraft.

**Widget-UI (Schüler):** Kein schwebendes Floating-Icon, sondern ein 🧠-Button direkt im Chat-Header neben dem Bot-Avatar. Klick öffnet ein **Popover** (gleicher Stil wie das TTS-Stimmwahl-Popover), das die Textarea für `preference_text` sowie Speichern/Löschen enthält. Der 🧠-Button liegt immer am nächsten am Avatar; der ▁▃█-TTS-Button folgt rechts davon. Beide Buttons sind dynamisch: fehlt eines der Features, rückt der verbleibende Button direkt an den Avatar.

## Prompt-Assistent

Workflow zur Erstellung eines Aufgabenprompts vor dem Unterricht. KI analysiert die Aufgabe, stellt bei aktiver Option Rückfragen (grill-me-Muster), und generiert daraus einen fertigen Aufgabenprompt-Vorschlag. Option „Rückfragen erwünscht" ist standardmäßig aktiv, wird aber nutzerspezifisch gespeichert. Ersetzt die Simulation als primären Weg zu einem guten Prompt vor dem Unterricht.

**Aufgabenkontext-Übertragung:** `moo-bot.js` extrahiert beim Öffnen des Config-Overlays die Aufgabenbeschreibung (`.activity-description`) aus dem Moodle-DOM und lädt alle `<img>`-Tags als Base64. Beides wird per `postMessage` (`moogpt:taskContext`) an das Config-Iframe übertragen. `config.js` hält diesen Kontext in `taskContext = { task, images }`.

**Rückfragen-Gesprächsverlauf:** Bei jedem Turn sendet das Frontend `currentPrompt + messages + taskImages` an `/suggest-prompt`. Das Backend stellt dem gesamten Verlauf immer die vollständige Aufgabenkontext-Nachricht voran (Text + Bilder) — analog zu ChatGPT, das bei jeder Anfrage den kompletten Verlauf inkl. früher übertragener Bilder mitschickt. Ohne dieses Voranstellen würde das Modell ab Turn 2 weder die Aufgabenstellung noch die Bilder kennen.

## Werkzeug-Aufruf

Ein einzelner messbarer AI-Call, ausgelöst durch ein Lehrer-Werkzeug. Hat einen `call_type`, einen Zeitstempel, ein Modell, Token-Zahlen (Eingabe/Ausgabe) und berechenbare Kosten in €. Erscheint in der Detailliste auf `/dashboard/costs`. Pro Simulations-Durchlauf zählt ein Werkzeug-Aufruf (alle Teil-Calls zusammengefasst).

**Darstellung:**
- *Inline* (direkt nach jedem Schritt im Dashboard-Werkzeug): nur Betrag in € für diesen Schritt, dezent
- *Laufende Summe* (unten im Werkzeug-Panel, analog zu Schüler-Chat-Gesamtkosten): akkumuliert clientseitig über alle Schritte der aktuellen Sitzung
- *Detailliste* (`/dashboard/costs`): Zeitstempel, Typ, Modell, Eingabe-Token, Ausgabe-Token, Kosten in €

Falls Preisdaten noch nicht geladen: Inline-Anzeige entfällt still, Detailliste zeigt „–" statt Betrag.

## Chat-Kosten

KI-Kosten, die durch schülerinitiierte Aktionen entstehen: Schüler-Chats, Audio-Transkriptionen (Whisper) und TTS-Ausgaben. Werden in `token_log` mit `thread_id` und `activity_id` gespeichert. Chat-Nachrichten haben `call_type = NULL`; Audio-Transkriptionen `call_type = 'transcription'`; TTS-Ausgaben `call_type = 'tts'`. Im Dashboard pro Thread sichtbar.

**Darstellung auf `/dashboard/costs`:** Die Kostenübersicht zeigt eine einzelne Tabelle mit zwei Abschnitten. Ganz oben immer **3 feste aggregierte Zeilen** für Schülerkosten der gesamten Aktivität:
1. *Chatkosten Schüler gesamt* — Summe aller `call_type = NULL`-Einträge
2. *Audiokosten Schüler gesamt* — Summe aller `call_type = 'transcription'`-Einträge
3. *TTS-Kosten Schüler gesamt* — Summe aller `call_type IN ('tts-prep', 'tts')`-Einträge

Darunter (mit Trennzeile) die chronologischen Einzeleinträge der **Werkzeug-Aufrufe** (Lehrerkosten). Der Tabellen-Container erhält `max-height` + `overflow-y: auto` damit alle Zeilen scrollbar erreichbar sind. Die Sektion heißt nicht mehr nur „Werkzeug-Aufrufe" sondern „Kostenübersicht" o.ä.

## TTS-Ausgabe

Bot-Antworten werden per Klick auf ein Lautsprecher-Icon als Sprache abgespielt. Verarbeitung serverseitig: wird der Rohtext (Markdown + ggf. LaTeX) immer durch einen GPT-mini-Call bereinigt: Markdown-Syntax entfernen, LaTeX-Formeln in natürlich gesprochenes Deutsch übersetzen; anschließend OpenAI TTS (`tts-1-hd`). Snippet-Parameter: `audioOutput: on|off` (TTS an/aus, Default `off`), `ttsVoice` (Aktivitäts-Default-Stimme, Default `nova`), `audioStudentOptions: on|off` (gibt Schülern Stimmwahl + Auto-Play-Toggle frei, Default `off`). Auto-Play liest jede abgeschlossene Bot-Antwort automatisch vor — kein Gesprächsmodus, kein automatisches Mikrofon. Schüler können Stimme (`preferred_voice`) und Auto-Play (`tts_autoplay`) global in `student_memory` speichern (geräteübergreifend); beides nur sichtbar wenn `audioStudentOptions: on`. Verfügbare Stimmen (kein `fable`): `nova` (weiblich, klar, lebendig), `alloy` (neutral, androgyn), `echo` (männlich, klar, sachlich), `onyx` (männlich, tief, ruhig), `shimmer` (weiblich, weich). Der ▁▃█-TTS-Button erscheint im Chat-Header rechts neben dem 🧠-Memory-Button (bzw. direkt am Avatar wenn Memory deaktiviert); Klick öffnet ein Mini-Popover mit Name + Beschreibung pro Stimme + Auto-Play-Toggle. **TTS gilt auch für alte Nachrichten aus der DB** — beim Laden der Chat-History wird an jede Bot-Nachricht ein 🔊-Button gehängt (wenn `audioOutput=on`). Geschwindigkeit (0,5–1,5) clientseitig, nicht persistent. Kosten: `call_type = 'tts-prep'` (GPT-mini-Tokens) + `call_type = 'tts'` (`tts_characters`). Beide schülerinitiiert → Chat-Kosten.

## Werkzeug-Kosten

KI-Kosten, die durch lehrerinitiierte Aktionen entstehen: Live-Unterrichts-Zusammenfassung, Prompt-Assistent, Kriterien-Generierung, Persona-Generierung, Simulation, Prompt-Optimierung. Immer aktivitätsbezogen — Calls ohne `activityId` werden nicht erfasst. Werden in `token_log` mit einer neuen Spalte `call_type` gespeichert. Bekannte Typen und ihre Anzeigenamen:

| `call_type` | Anzeige |
|---|---|
| `live-summary` | Unterrichts-Zusammenfassung |
| `prompt-assist` | Prompt-Assistent |
| `criteria` | Kriterien-Generierung |
| `optimize` | Prompt-Optimierung |
| `persona` | Persona-Generierung |
| `simulation` | Simulation |
| `transcription` | Audio-Transkription (schülerinitiiert, Chat-Kosten) |
| `tts-prep` | TTS-Vorverarbeitung via GPT-mini (schülerinitiiert, Chat-Kosten) |
| `tts` | TTS-Ausgabe via tts-1-hd (schülerinitiiert, Chat-Kosten) |

Pro Simulations-Durchlauf ein Eintrag (alle Teil-Calls summiert). Calls ohne `activityId` werden nicht erfasst.

## Moodle-Snippet

Das einzige aktive Snippet ist `snippets/moogpt.txt` (`key: "moogpt"`). Es enthält nur den `<script type="module">`-Block, der `MOOBOT` instanziiert — keine Einstellungen im HTML. Die alten Snippets `abgpt.txt` und `tegpt.txt` sind **deprecated** und werden nicht mehr verwendet (`tegpt` funktioniert ohnehin nicht mehr). Konfiguration erfolgt ausschließlich über `config.html` (Zahnrad-Button).

Das Snippet enthält einen **Editor-Hinweis-Block** — ein farbig hervorgehobenes `<div>`, das nur im Moodle-Editor sichtbar ist (per `display:none` via Script beim Seitenaufruf ausgeblendet). Inhalt: „Moo-GPT eingebaut. Zum Entfernen: HTML-Ansicht → Script-Tag löschen." Zweck: verhindert versehentliches Doppel-Einfügen. Zwei Instanzen von `MOOBOT` auf einer Seite erzeugen doppelte DOM-IDs und doppelte WebSocket-Verbindungen — unvorhersehbares Verhalten.

## Live-Unterrichts-Überblick

KI-generierte inhaltliche Zusammenfassung der häufigsten Themen und Fragen aus allen laufenden Schüler-Chats einer Aktivität. Nicht wörtlich, sondern thematisch. Erscheint auf einer eigenen Dashboard-Seite (`/dashboard/overview`) und wird manuell per Knopfdruck aktualisiert. Dient der Vorbereitung auf Plenumsphasen — Lehrkraft sieht, was besprochen werden sollte, bevor sie den Chat sperrt.

## Fehler-Meldung

Workflow, mit dem eine Lehrkraft einen Fehler als GitHub-Issue melden kann. Zugang: Button im Dashboard (unauffällig, z.B. Footer oder Header). Ablauf:

1. Lehrkraft beschreibt das Problem in einem Freitext-Feld.
2. KI analysiert die Beschreibung und schlägt relevante Zusatz-Materialien vor (Aufgabenprompt, Aktivitäts-Config, ggf. anonymisierte Chat-Auszüge).
3. Ergebnis-Seite: aufbereiteter Issue-Text + Checkliste der beizufügenden Materialien (alle einzeln abwählbar) + Vorschau der Materialien darunter.
4. Zwei Buttons: „Mit Material senden" (öffnet GitHub-New-Issue-URL mit vorausgefülltem Titel + Body, max. ~8 KB) und „Nur Beschreibung senden" (ohne Anhänge).

**Datenschutz Chat-Logs:** Schüler-IDs werden durch neutrale Labels ersetzt (Schüler A, B, C …). Freitext kann dennoch Namen enthalten. Checkbox für Chat-Auszüge standardmäßig **abgewählt** mit kurzem Hinweis.

**Implementierung:** Kein GitHub-Token — Issue wird via URL (`github.com/matthiasgruenwald/moo-gpt/issues/new?title=...&body=...`) im Browser geöffnet. Inhalt priorisiert nach: Beschreibung → Prompt → Config → Chat-Log (bis ~8 KB).
