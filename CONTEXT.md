# moo-gpt – Domain-Glossar

Kanonische Fachbegriffe für dieses Projekt. Neue Konzepte werden hier eingetragen, sobald sie im Gespräch geklärt sind.

---

## Aktivität

Eine Moodle-Aktivität (Textseite oder Aufgabe), in die ein Chat-Widget eingebettet ist. Jede Aktivität hat eine eindeutige `activityId` und eine eigene Widget-Konfiguration.

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

Schülerspezifische Präferenzen und Wünsche, die als unsichtbare Instruktion in den Systemprompt eingebunden werden. Entsteht aus Schüler-Feedback (Daumen-Button + Freitext im Widget) oder aus Lehrer-Eingabe im Dashboard. Wird per Schüler-ID gespeichert und bei jedem neuen Chat geladen. Schüler können ihren eigenen Memory-Text über einen Button im Widget einsehen und bearbeiten; Lehrkräfte können ihn im Dashboard anzeigen, bearbeiten und löschen. Ermöglicht Differenzierung ohne expliziten Aufwand für die Lehrkraft.

## Prompt-Assistent

Workflow zur Erstellung eines Aufgabenprompts vor dem Unterricht. KI analysiert die Aufgabe, stellt bei aktiver Option Rückfragen (grill-me-Muster), und generiert daraus einen fertigen Aufgabenprompt-Vorschlag. Option „Rückfragen erwünscht" ist standardmäßig aktiv, wird aber nutzerspezifisch gespeichert. Ersetzt die Simulation als primären Weg zu einem guten Prompt vor dem Unterricht.

## Live-Unterrichts-Überblick

KI-generierte inhaltliche Zusammenfassung der häufigsten Themen und Fragen aus allen laufenden Schüler-Chats einer Aktivität. Nicht wörtlich, sondern thematisch. Erscheint auf einer eigenen Dashboard-Seite (`/dashboard/overview`) und wird manuell per Knopfdruck aktualisiert. Dient der Vorbereitung auf Plenumsphasen — Lehrkraft sieht, was besprochen werden sollte, bevor sie den Chat sperrt.
