# TinyMCE-Snippet: moo-gpt

Moodle-Snippet für das moo-gpt Chat-Widget. Wird per TinyMCE-Plugin in Moodle-Aktivitäten eingefügt.

## Verfügbares Snippet

| Datei | Einsatz |
|-------|---------|
| `snippets/moo-gpt.txt` | Aufgaben-Chat (Bild-/PDF-Upload, Audio, TTS) |

---

## Parameter (moo-gpt)

Alle Parameter werden direkt in der Moodle-Aktivität im TinyMCE-Editor bearbeitet (gestricheltes Einstellungsfeld, nur im Editor sichtbar).

### Titel

**Feld:** `Titel`  
**Default:** `Lern-Assistent`  
**Erlaubt:** Beliebiger Text  
**Zweck:** Name des Bots im Chat-Fenster-Header.

---

### Begrüßung

**Feld:** `Begrüßung`  
**Default:** `Hallo! Wie kann ich dir bei der Aufgabe helfen?`  
**Erlaubt:** Beliebiger Text (Markdown-fähig)  
**Zweck:** Erste Nachricht des Bots beim Öffnen des Chats.

---

### Bild

**Feld:** `Bild`  
**Default:** `grw`  
**Erlaubt:** `grw` · `grw2` · `weiblich`  
**Zweck:** Avatar-Bild des Bots.

---

### Hinweise

**Feld:** `Hinweise`  
**Default:** `z.B. Jahrgang 9; Fach Biologie; Thema Immunsystem. Antworte auf Deutsch.`  
**Erlaubt:** Beliebiger Text  
**Zweck:** Aufgaben-spezifischer Prompt-Anhang (wird als Erfahrungsprompt in der DB gespeichert). Beim ersten Öffnen einer Aktivität automatisch als Erfahrungsprompt importiert.

---

### Upload-Modus

**Feld:** `Upload-Modus`  
**Default:** `off`  
**Erlaubt:** `off` · `images` · `files`  
**Zweck:** Steuert, ob und welche Dateitypen Schüler hochladen dürfen.

| Wert | Verhalten |
|------|-----------|
| `off` | Kein Upload-Button (Standard, keine Extrakosten) |
| `images` | Bilder (JPEG, PNG, WebP) erlaubt |
| `files` | Bilder + PDF erlaubt |

---

### Mikrofon (audioInput)

**Feld:** `Mikrofon`  
**Default:** `off`  
**Erlaubt:** `off` · `on`  
**Zweck:** Aktiviert den Mikrofon-Button für Spracheingaben via Whisper-Transkription.

| Wert | Verhalten |
|------|-----------|
| `off` | Kein Mikrofon-Button (Standard, Opt-in) |
| `on` | Mikrofon-Button erscheint neben dem Senden-Button |

**Voraussetzungen für `on`:**
- HTTPS-Verbindung (MediaRecorder-API erfordert sicheren Kontext)
- Browser muss `MediaRecorder` und `getUserMedia` unterstützen (Chrome, Firefox, Safari ≥ 14.1)
- Schüler müssen Mikrofon-Berechtigung im Browser erteilen

**Ablauf:**
1. Schüler klickt Mikrofon-Button → Browser fragt nach Berechtigung
2. Aufnahme läuft (max. 60 Sekunden, Countdown sichtbar)
3. Zweiter Klick oder Auto-Stop → Whisper transkribiert die Aufnahme
4. Transkribierter Text erscheint editierbar im Eingabefeld
5. Schüler kann Text korrigieren und normal senden
6. Gesendete Nachricht wird im Dashboard mit 🎤-Icon markiert

**Kosten:** Whisper-API berechnet $0,0001/s (≈ 0,009 Ct/s). Kosten werden im Dashboard unter „Audio-Transkription" angezeigt.

---

## Beispiel: moo-gpt mit Mikrofon

```
Titel=Sprach-Assistent
Begrüßung=Hallo! Du kannst mir sprechen oder schreiben.
Bild=grw
Hinweise=Jahrgang 9; Fach Englisch; Übe Aussprache und Grammatik.
Upload-Modus=off
Mikrofon=on
```

---

## Technische Details

Der Snippet lädt `moo-bot.js` als ES-Modul und instanziiert `MOOBOT` mit einem `settings`-Objekt:

```js
const settings = {
  "host":       "gpt.gruenwald.fun",
  "protocol":   "https",
  "port":       443,
  "title":      get("title"),      // aus DOM gelesen
  "opener":     get("opener"),
  "chat_icon":  "https://gpt.gruenwald.fun/" + get("icon") + ".png",
  "task":       htmlContent,       // Aufgabenbeschreibung aus Moodle-DOM
  "hints":      get("hints"),
  "uploadMode": get("uploadmode") || "off",
  "audioInput": get("audioinput") || "off"   // Issue #89
};
```

`audioInput` wird **nicht** an den Server übertragen – es steuert rein clientseitig die Sichtbarkeit des Mikrofon-Buttons.
