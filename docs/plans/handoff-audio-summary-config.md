# Handoff: Audio-Zusammenfassung im Config-Akkordeon

**Ziel:** Lehrkräfte sehen beim zugeklappten Audio-Akkordeon sofort, welche Einstellungen aktiv sind — ohne das Menü öffnen zu müssen.

**Stand:** TTS-Feature vollständig implementiert und getestet (Issue #24, Branch `feat/tts-24`).

---

## Gewünschtes Verhalten

Im zugeklappten Zustand zeigt `<summary>Audio</summary>` rechts daneben einen kurzen Status-Text:

```
▶ Audio — Eingabe: an | Ausgabe: an (nova)
▶ Audio — Eingabe: aus | Ausgabe: an (nova, Schüler-Optionen: an)
▶ Audio — alles aus          ← (oder einfach nichts anzeigen, wenn alles off)
```

Im geöffneten Zustand (`[open]`) kann der Status-Text ausgeblendet oder kleiner/grauer dargestellt werden (optional).

---

## Zu ändernde Dateien

### 1. `public/config.html` — HTML-Anpassung

**Aktuelle Zeile 331:**
```html
<summary>Audio</summary>
```

**Neu:**
```html
<summary>Audio<span id="cfg-audio-summary" class="cfg-audio-summary-text"></span></summary>
```

**CSS hinzufügen** (in den bestehenden `<style>`-Block, z. B. nach `.cfg-audio-details summary`):
```css
.cfg-audio-summary-text {
  font-weight: 400;
  font-size: 10px;
  color: #888;
  margin-left: 8px;
  letter-spacing: 0;
  text-transform: none;
}
/* Im geöffneten Zustand ausblenden (optional) */
.cfg-audio-details[open] .cfg-audio-summary-text {
  display: none;
}
```

---

### 2. `public/config.js` — Logik

**Neue Hilfsfunktion** (z. B. direkt nach `updateAudioOutputDependents`):

```js
function updateAudioSummary() {
  const el = document.getElementById('cfg-audio-summary');
  if (!el) return;

  const input   = document.getElementById('cfg-audio-input').value;
  const output  = document.getElementById('cfg-audio-output').value;
  const voice   = document.getElementById('cfg-tts-voice').value;
  const student = document.getElementById('cfg-audio-student-options').value;

  if (input === 'off' && output === 'off') {
    el.textContent = '';   // alles aus → kein Text
    return;
  }

  const parts = [];
  if (input  === 'on')  parts.push('Eingabe: an');
  if (output === 'on')  {
    let out = 'Ausgabe: an';
    if (voice && voice !== 'nova') out += ` (${voice})`;   // nova ist Standard → weglassen
    if (student === 'on') out += ', Schüler-Opt: an';
    parts.push(out);
  } else {
    parts.push('Ausgabe: aus');
  }

  el.textContent = ' — ' + parts.join(' | ');
}
```

**Aufrufen an drei Stellen:**

1. Nach dem Befüllen der Felder beim Laden (nach Zeile ~319 im `fetch`-Block):
   ```js
   updateAudioSummary();
   ```

2. Im `change`-Listener für `cfg-audio-output` (bereits vorhanden bei ca. Zeile 145):
   ```js
   document.getElementById('cfg-audio-output').addEventListener('change', () => {
     updateAudioOutputDependents();
     updateAudioSummary();
   });
   ```
   *(Derzeit wird nur `updateAudioOutputDependents` aufgerufen — durch Arrow-Function ersetzen)*

3. Change-Listener für die anderen Audio-Felder ergänzen:
   ```js
   ['cfg-audio-input', 'cfg-tts-voice', 'cfg-audio-student-options'].forEach(id => {
     document.getElementById(id)?.addEventListener('change', updateAudioSummary);
   });
   ```

---

## Akzeptanzkriterien

- [ ] Akkordeon zugeklappt: Status-Text erscheint rechts neben "Audio"
- [ ] Alle Felder aus → kein Text (oder "alles aus", je nach Geschmack)
- [ ] Nur Eingabe an → "Eingabe: an"
- [ ] Ausgabe an mit nova → "Ausgabe: an" (keine Stimme, nova = Standard)
- [ ] Ausgabe an mit anderer Stimme → "Ausgabe: an (echo)"
- [ ] Schüler-Opt an → "Ausgabe: an, Schüler-Opt: an"
- [ ] Text aktualisiert sich sofort bei Änderung eines Felds (kein Speichern nötig)
- [ ] Akkordeon geöffnet: Text ausgeblendet (sauber durch CSS)

---

## Hinweise für Implementierung

- Kein neuer Endpoint, kein Backend-Code — rein Frontend.
- TDD: Diese Logik lässt sich mit jsdom/vitest gut unit-testen (`updateAudioSummary` ist eine pure DOM-Funktion).
- Karpathy: Keine neue Abstraktion nötig — die Funktion ist ~15 Zeilen, inline in config.js.
- Branch: Neuen Branch von `feat/tts-24` oder direkt von `main` (falls `feat/tts-24` bis dahin gemergt).
