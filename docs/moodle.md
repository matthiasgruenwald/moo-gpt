# Einbindung in Moodle

## Voraussetzungen

- Moodle mit TinyMCE-Editor
- Plugin **Snippet für TinyMCE** (`tiny_snippet`) installiert
- Zugang zu einer laufenden moo-gpt-Instanz

## Schnellstart: TinyMCE-Snippets

Zwei fertige Snippets liegen im Verzeichnis `snippets/`:

| Snippet | Datei | Einsatz |
|---|---|---|
| `abgpt` | `snippets/snippet1_aufgabe.html` | Moodle-Aufgaben – liest Aufgabentext und Bilder automatisch |
| `tegpt` | `snippets/snippet2_testfrage.html` | Quiz-/Testfragen – iframe-Variante |

Einrichtung und Import im Detail: → [`snippets/SNIPPET-SETUP.md`](../snippets/SNIPPET-SETUP.md)

## Manuell einbinden

> ⚠️ **Aktuell nicht empfohlen.** Die Konfiguration des Widgets erfolgt serverseitig über das Dashboard – eine vollständige manuelle Einbindung per HTML-Snippet ist derzeit nicht funktional. Für diesen Anwendungsfall bitte ein [Issue anlegen](https://github.com/matthiasgruenwald/moo-gpt/issues/new).

## Manuell einbinden (Quiz-/Testfrage)

Quiz-Fragen blockieren `<script>`-Tags – hier wird eine iframe-Variante verwendet. Aufgabentext und Hinweise werden als URL-Parameter übergeben. Siehe `snippets/tegpt.txt` für das fertige Snippet.

> ⚠️ **Bekannte Lücke:** Das iframe hat keinen Zugriff auf das Parent-DOM und kann die Lehrkraft-Rolle nicht erkennen. Separates Issue geplant.

## Lehrer-Dashboard

Lehrkräfte sehen nach dem Öffnen des Chat-Widgets automatisch einen Dashboard-Button (blaues Icon über dem Chat-Button). Ein Klick öffnet das Dashboard in einem neuen Tab.

**Inhalte:**
- Schülerliste mit Name, letzter Aktivität, Nachrichtenanzahl
- Vollständiger Chatverlauf je Schüler (read-only)
- Live-Updates: neue Nachrichten erscheinen sofort
- Token-Kosten je Session

**Zugang:** Nur mit automatisch generiertem Token möglich (8 Stunden gültig). Nach Ablauf Chat-Widget einmal öffnen – neuer Token wird automatisch zugeschickt.

## Rollenerkennung

Das Widget erkennt automatisch, ob der aktuelle Nutzer Lehrkraft oder Schüler ist und zeigt die Oberfläche entsprechend an. Die Erkennung funktioniert zuverlässig im **Boost-Theme**. Bei anderen Themes oder nach Moodle-Updates kann es sein, dass die Erkennung nicht greift – in diesem Fall den Administrator bitten, die Lehrkraft-IDs in der Serverkonfiguration einzutragen (`TEACHER_USER_IDS`).

## Bilderkennung

Bilder in der Aufgabenstellung werden automatisch erkannt und an die KI übergeben. Das funktioniert zuverlässig für Grafiken und Diagramme in normaler Auflösung.

**Vorsicht bei hochauflösenden Fotos** (z. B. fotografierte Schulbuchseiten): Ab einer bestimmten Dateigröße kann die Übertragung fehlschlagen. Bilder möglichst als komprimiertes PNG oder SVG einbinden. Bilder müssen im **Moodle-Medienpool** liegen – externe Quellen funktionieren nicht (CORS).
