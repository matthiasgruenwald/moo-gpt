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

## Manuell einbinden (Aufgabe)

```html
<script type="module" async id="moo-bot">
  const settings = {
    "host": "moo-gpt.beispiel.de",
    "protocol": "https",
    "port": 443,
    "opener": "Hallo, wie kann ich dir helfen?",
    "title": "KI-Assistent",
    "hints": "Du gibst nur Hinweise, keine fertigen Lösungen.",
    "task": document.querySelector('.activity-description')?.innerHTML || ""
  };
  import { MMBBSBOT } from 'https://moo-gpt.beispiel.de/moo-bot.js';
  const bot = new MMBBSBOT(settings);
</script>
```

`host` und die Import-URL auf die eigene moo-gpt-Instanz anpassen.

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

Das Widget erkennt automatisch, ob der aktuelle Nutzer Lehrkraft oder Schüler ist:

- **Lehrkraft:** `form[action*="editmode.php"]` (Bearbeiten-Button) im Moodle-DOM sichtbar
- **„Als Teilnehmer ansehen":** Moodle setzt die Body-Klasse `userswitchedrole` – wird korrekt als Schüler erkannt
- **Serverseitiger Override:** `TEACHER_USER_IDS` in der Serverkonfiguration setzen

> ⚠️ **Theme-Abhängigkeit:** Funktioniert zuverlässig im Boost-Theme. Bei anderen Themes in der Browser-Konsole prüfen:
> ```js
> document.querySelector('form[action*="editmode.php"]') !== null
> ```
> Muss für Lehrkräfte `true` und für Schüler `false` ergeben.

## Bilderkennung

Bilder in der Aufgabenstellung werden automatisch erkannt und an die KI übergeben.

- Bilder müssen im **Moodle-Medienpool** liegen (kein CORS-Problem)
- SVG oder komprimierte PNGs bevorzugen – sehr große Bilder oder Fotos von Schulbuchseiten können fehlschlagen
- Diagnose: `journalctl -u moo-gpt -f` – fehlendes „Füge X Bild(er) hinzu" bedeutet, das Bild kam nicht an
