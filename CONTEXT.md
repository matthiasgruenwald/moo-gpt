# moo-gpt – Domain-Glossar

Kanonische Fachbegriffe für dieses Projekt. Neue Konzepte werden hier eingetragen, sobald sie im Gespräch geklärt sind.

---

## Aktivität

Eine Moodle-Aktivität (Textseite oder Aufgabe), in die ein Chat-Widget eingebettet ist. Jede Aktivität hat eine eindeutige `activityId` und eine eigene Widget-Konfiguration. Wird einer Lehrkraft zugeordnet (`teacher_id` in `activities`-Tabelle), sobald die Lehrkraft das Dashboard für diese Aktivität öffnet. Ermöglicht Admin-seitige Kosten-Aufschlüsselung nach Lehrer.

## Widget-Konfiguration

Die konfigurierbaren Felder, die das Verhalten und Erscheinungsbild des Chat-Bots für eine Aktivität festlegen: `botTitle`, `botIcon`, `uploadMode`, `opener`, `hints`, `task`, `taskImage`. Wird auf drei Ebenen definiert — Systemvorlage → Lehrer-Vorlage → Aktivitätskonfiguration — wobei jede Ebene die darüber überschreibt.

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

## Prompt-Assistent

Workflow zur Erstellung eines Aufgabenprompts vor dem Unterricht. KI analysiert die Aufgabe, stellt bei aktiver Option Rückfragen (grill-me-Muster), und generiert daraus einen fertigen Aufgabenprompt-Vorschlag. Option „Rückfragen erwünscht" ist standardmäßig aktiv, wird aber nutzerspezifisch gespeichert. Ersetzt die Simulation als primären Weg zu einem guten Prompt vor dem Unterricht.

## Werkzeug-Aufruf

Ein einzelner messbarer AI-Call, ausgelöst durch ein Lehrer-Werkzeug. Hat einen `call_type`, einen Zeitstempel, ein Modell, Token-Zahlen (Eingabe/Ausgabe) und berechenbare Kosten in €. Erscheint in der Detailliste auf `/dashboard/costs`. Pro Simulations-Durchlauf zählt ein Werkzeug-Aufruf (alle Teil-Calls zusammengefasst).

**Darstellung:**
- *Inline* (direkt nach jedem Schritt im Dashboard-Werkzeug): nur Betrag in € für diesen Schritt, dezent
- *Laufende Summe* (unten im Werkzeug-Panel, analog zu Schüler-Chat-Gesamtkosten): akkumuliert clientseitig über alle Schritte der aktuellen Sitzung
- *Detailliste* (`/dashboard/costs`): Zeitstempel, Typ, Modell, Eingabe-Token, Ausgabe-Token, Kosten in €

Falls Preisdaten noch nicht geladen: Inline-Anzeige entfällt still, Detailliste zeigt „–" statt Betrag.

## Chat-Kosten

KI-Kosten, die durch schülerinitiierte Aktionen entstehen: Schüler-Chats, Audio-Transkriptionen (Whisper) und TTS-Ausgaben. Werden in `token_log` mit `thread_id` und `activity_id` gespeichert. Chat-Nachrichten haben `call_type = NULL`; Audio-Transkriptionen `call_type = 'transcription'`; TTS-Ausgaben `call_type = 'tts'`. Im Dashboard pro Thread sichtbar.

## TTS-Ausgabe

Bot-Antworten werden per Klick auf ein Lautsprecher-Icon als Sprache abgespielt. Verarbeitung serverseitig: wird der Rohtext (Markdown + ggf. LaTeX) immer durch einen GPT-mini-Call bereinigt: Markdown-Syntax entfernen, LaTeX-Formeln in natürlich gesprochenes Deutsch übersetzen; anschließend OpenAI TTS (`tts-1-hd`). Snippet-Parameter: `audioOutput: on|off` (TTS an/aus, Default `off`), `ttsVoice` (Aktivitäts-Default-Stimme, Default `nova`), `audioStudentOptions: on|off` (gibt Schülern Stimmwahl + Auto-Play-Toggle frei, Default `off`). Auto-Play liest jede abgeschlossene Bot-Antwort automatisch vor — kein Gesprächsmodus, kein automatisches Mikrofon. Schüler können Stimme (`preferred_voice`) und Auto-Play (`tts_autoplay`) global in `student_memory` speichern (geräteübergreifend); beides nur sichtbar wenn `audioStudentOptions: on`. Verfügbare Stimmen (kein `fable`): `nova` (weiblich, klar, lebendig), `alloy` (neutral, androgyn), `echo` (männlich, klar, sachlich), `onyx` (männlich, tief, ruhig), `shimmer` (weiblich, weich). Der Voice-Selector erscheint im Chat-Header links neben dem Bot-Avatar (nur wenn `audioStudentOptions: on`) als Waveform-Icon (▁▃█); Klick öffnet ein Mini-Popover mit Name + Beschreibung pro Stimme + Auto-Play-Toggle. Der Schließen-Button rechts bleibt alleine. Geschwindigkeit (0,5–1,5) clientseitig, nicht persistent. Kosten: `call_type = 'tts-prep'` (GPT-mini-Tokens) + `call_type = 'tts'` (`tts_characters`). Beide schülerinitiiert → Chat-Kosten.

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

## Live-Unterrichts-Überblick

KI-generierte inhaltliche Zusammenfassung der häufigsten Themen und Fragen aus allen laufenden Schüler-Chats einer Aktivität. Nicht wörtlich, sondern thematisch. Erscheint auf einer eigenen Dashboard-Seite (`/dashboard/overview`) und wird manuell per Knopfdruck aktualisiert. Dient der Vorbereitung auf Plenumsphasen — Lehrkraft sieht, was besprochen werden sollte, bevor sie den Chat sperrt.
