# Einbindung in Moodle

## Voraussetzungen

- Moodle mit TinyMCE-Editor
- Plugin **Snippet für TinyMCE** (`tiny_snippet`) installiert
- Zugang zu einer laufenden moo-gpt-Instanz

## Schnellstart: KI-Widget in eine Aufgabe einbetten

Sobald der Administrator das Snippet installiert hat, kann jede Lehrkraft das Widget in eigene Aufgaben einbetten:

1. Aufgabe in Moodle öffnen und den TinyMCE-Editor aufrufen
2. Im Editor-Menü das Snippet **„KI-Chat"** auswählen
3. Das Widget erscheint direkt in der Aufgabe – keine weitere Konfiguration nötig

![Snippet-Auswahl im TinyMCE-Editor](images/Snippet-in-Tiny-einfuegen.png)

Die verfügbaren Snippets und deren Import sind in [`snippets/SNIPPET-SETUP.md`](../snippets/SNIPPET-SETUP.md) beschrieben (für Administratoren).

## Manuell einbinden

> ⚠️ **Aktuell nicht empfohlen.** Die Konfiguration des Widgets erfolgt serverseitig über das Dashboard – eine vollständige manuelle Einbindung per HTML-Snippet ist derzeit nicht funktional. Für diesen Anwendungsfall bitte ein [Issue anlegen](https://github.com/matthiasgruenwald/moo-gpt/issues/new).


## Lehrer-Dashboard

Lehrkräfte sehen nach dem Öffnen des Chat-Widgets automatisch einen Dashboard-Button (blaues Icon über dem Chat-Button). Ein Klick öffnet das Dashboard in einem neuen Tab.

Das Dashboard gliedert sich in drei Bereiche: **Chats**, **Überblick** und **Einstellungen** (Tab-Leiste oben).

**Chats-Seite:**
- Schülerliste mit Name, letzter Aktivität, Nachrichtenanzahl
- Vollständiger Chatverlauf je Schüler; KI-Antworten können inline bearbeitet werden (Originalversion bleibt erhalten)
- Live-Updates: neue Nachrichten erscheinen sofort
- Token-Kosten je Session

**Zugang:** Nur mit automatisch generiertem Token möglich (8 Stunden gültig). Nach Ablauf Chat-Widget einmal öffnen – neuer Token wird automatisch zugeschickt.

<details>
<summary>Screenshot: Dashboard mit Schülerliste und Chatverlauf anzeigen</summary>

![Lehrer-Dashboard](images/Dashboard-Chats.png)

</details>

## Plenumsmodus

Über den **Stop-Button** (rotes Symbol über dem Chat-Button, nur für Lehrkräfte sichtbar) lässt sich der Chat für alle Schüler einer Aktivität sperren – ohne das Dashboard zu öffnen. Optional kann eine Dauer in Minuten angegeben werden; nach Ablauf wird der Chat automatisch freigegeben.


## Live-Unterrichts-Überblick

Die Seite **Überblick** im Dashboard bietet auf Knopfdruck eine thematische Zusammenfassung aller Chat-Verläufe der Aktivität: häufige Fragen, häufige Missverständnisse. Außerdem sichtbar: welche Schüler noch nicht gechattet haben. Kein automatisches Polling – nur manuell auslösbar.

> 📸 *Screenshot: Überblick-Seite (folgt)*

## Aufgabe konfigurieren

Über das Dashboard können Lehrkräfte den KI-Assistenten je Aufgabe anpassen: Titel, Bot-Typ, Erfahrungsprompt (Hinweise zum Lösungsweg) und weitere Einstellungen. Die Konfiguration öffnet sich über den Einstellungen-Button im Dashboard.

![Aktivitätseinstellungen](images/Aktivitätseinstellungen.png)

## Prompt mit KI erstellen (Prompt-Assistent)

Auf der Konfig-Seite gibt es zwei Wege, den Erfahrungsprompt per KI zu erstellen:

- **Rückfragen-Modus (Standard):** Die KI stellt 5 Klärungsfragen (Fach, Jahrgang, Rolle, Lernziel, Stil) und generiert daraus einen vollständigen Prompt.
- **Direktmodus:** Ein vorhandener Prompt wird sofort optimiert, ohne Rückfragen.

Der Vorschlag erscheint als Vorschau und wird erst nach bewusstem „Übernehmen" gespeichert.


## Prompt prüfen & verbessern

Der Button **„🔍 Prompt prüfen & verbessern"** (ebenfalls auf der Konfig-Seite) analysiert den vorhandenen Erfahrungsprompt auf Schwachstellen und schlägt eine verbesserte Version vor. Die Unterschiede werden als Word-Level-Diff hervorgehoben (Gelöschtes rot, Neues grün). Den Vorschlag kann man mit einem Klick übernehmen oder verwerfen.


## Prompt optimieren

Über den Tab **Optimierung** im Dashboard kann der Erfahrungsprompt einer Aufgabe verbessert werden – entweder vollautomatisch oder manuell:

- **One-Click-Optimierung:** Die KI generiert Kriterien, simuliert verschiedene Schüler-Personas und schlägt einen verbesserten Erfahrungsprompt vor – ohne weiteren Eingriff.
- **Manuelle Simulation:** Kriterien selbst festlegen oder von der KI vorschlagen lassen, eigene Personas ergänzen und die Simulation Schritt für Schritt durchführen.

<details>
<summary>Screenshot: Optimierung-Tab anzeigen</summary>

![Dashboard Optimierung-Tab](images/Dashboard-Optimierung.png)

</details>

## Schüler-Memory (Personalisierung)

Schüler können unter jeder KI-Antwort ein Feedback hinterlassen und optional eine Präferenz angeben (z. B. „Bitte kürzer antworten"). Die KI berücksichtigt diese Präferenz ab dem nächsten Chat-Start.

- **Schüler:** Das Memory-Icon im Widget-Header (nur sichtbar wenn Memory vorhanden) zeigt den gespeicherten Text – bearbeitbar und löschbar.
- **Lehrkraft:** Memory pro Schüler im Dashboard (**Chats**-Seite) sichtbar und verwaltbar – auch ohne vorherige Schüler-Aktion (z. B. um Hinweise für einzelne Schüler direkt einzutragen).


## Einstellungen (Admin)

Der Tab **Einstellungen** ist für Administratoren. Hier wird der globale System-Prompt und das Standard-Modell für alle Aufgaben festgelegt. Lehrkräfte können außerdem eigene Personas verwalten, die in der Simulation zur Verfügung stehen.

<details>
<summary>Screenshot: Einstellungen-Tab anzeigen</summary>

![Dashboard Einstellungen-Tab](images/DashboardEinstellungen.png)

</details>

## Rollenerkennung

Das Widget erkennt automatisch, ob der aktuelle Nutzer Lehrkraft oder Schüler ist und zeigt die Oberfläche entsprechend an. Die Erkennung funktioniert zuverlässig im **Boost-Theme**. Bei anderen Themes oder nach Moodle-Updates kann es sein, dass die Erkennung nicht greift – in diesem Fall den Administrator bitten, die Lehrkraft-IDs in der Serverkonfiguration einzutragen (`TEACHER_USER_IDS`).

## Audio: Spracheingabe & Vorlesen

### Spracheingabe (Whisper)

Wenn in der Aufgabenkonfiguration aktiviert, erscheint ein Mikrofon-Button im Widget. Schüler können damit sprechen; die Aufnahme wird automatisch per Whisper transkribiert und als Text gesendet. Kosten werden im Dashboard unter „Audio-Transkription" angezeigt.

### Vorlesen (TTS)

Wenn aktiviert, kann jede KI-Antwort mit einem Lautsprecher-Button vorgelesen werden. Stimme und Auto-Play-Verhalten sind pro Aufgabe konfigurierbar. Schüler können die Wiedergabe steuern, wenn die Lehrkraft die Schüler-Optionen freigeschaltet hat.

### Features aktivieren und deaktivieren

Spracheingabe, TTS, Dateiupload und weitere Widget-Funktionen lassen sich pro Aufgabe in den Aktivitätseinstellungen ein- oder ausschalten. Welche Optionen verfügbar sind, zeigt der Screenshot der Einstellungen.


## Bilderkennung

Bilder in der Aufgabenstellung werden automatisch erkannt und an die KI übergeben. Das funktioniert zuverlässig für Grafiken und Diagramme in normaler Auflösung.

**Vorsicht bei hochauflösenden Fotos** (z. B. fotografierte Schulbuchseiten): Ab einer bestimmten Dateigröße kann die Übertragung fehlschlagen. Bilder möglichst als komprimiertes PNG oder SVG einbinden. Bilder müssen im **Moodle-Medienpool** liegen – externe Quellen funktionieren nicht (CORS).
