# TinyMCE Snippet – Einrichtung

Plugin: **Snippet für TinyMCE** (tiny_snippet)

---

## Snippet 1: KI-Chat (liest Aufgabentext + Bilder)

| Feld         | Wert                          |
|--------------|-------------------------------|
| **Name**     | KI-Chat (liest Aufgabentext+Bilder) |
| **Key**      | abgpt                         |

**HTML-Inhalt:** → Datei `snippet1_aufgabe.html` einfügen

**Defaults (jede Zeile einzeln eingeben – kein Copy/Paste des ganzen Blocks!):**

```
Titel=Lern-Assistent
Begrüßung=Hallo! Wie kann ich dir bei der Aufgabe helfen?
Bild-URL=https://gpt.gruenwald.fun/grw.png
Hinweise=Jahrgang: , Fach: , Thema: . Antworte auf Deutsch.
```

> ⚠️ **Wichtig:** Das Defaults-Textfeld im Moodle-Admin zeigt jeden Wert in einer eigenen Zeile.
> Falls Werte zusammengeführt erscheinen (z.B. "Lern-AssistentBegrüßung="), manuell prüfen
> und jeden Eintrag auf eine eigene Zeile setzen.

---

## Snippet 2: KI-Chat für Testfragen (iframe)

| Feld         | Wert                          |
|--------------|-------------------------------|
| **Name**     | KI-Chat Testfrage (iframe)    |
| **Key**      | tegpt                         |

**HTML-Inhalt:** → Datei `snippet2_testfrage.html` einfügen

**Defaults:**

```
Titel=Lern-Assistent
Begrüßung=Hallo! Wie kann ich dir bei der Aufgabe helfen?
Aufgabentext=Aufgabe hier einfügen...
Hinweise=Jahrgang: , Fach: , Thema: . Antworte auf Deutsch.
```

---

## Trigger-Hinweis

Das Snippet wird **nicht mit Enter**, sondern mit **Tab** ausgelöst:

1. Im TinyMCE-Editor `abgpt` eingeben
2. **Tab-Taste** drücken → Dialog öffnet sich

---

## Snippet 2 HTML (Vorlage)

```html
<iframe
  src="https://gpt.gruenwald.fun/chat.html?protocol=https&host=gpt.gruenwald.fun&port=443
    &title={{Titel}}
    &opener={{Begrüßung}}
    &task={{Aufgabentext}}
    &hints={{Hinweise}}"
  width="100%"
  height="450"
  frameborder="0"
  style="border:1px solid #ddd; border-radius:8px;">
</iframe>
```
