# Schritt 03: optimize.js – Store-Zugriffe entkoppeln

**Problem:** `optimize.js` holt sich drei Datenquellen selbst aus Stores: `getActiveErfahrungsprompt`, `getErkenntnisse`, `getFeedbackByActivity`. Das koppelt die Funktion an die Store-Schicht und macht sie schwerer testbar.

**Lösung:** Alle Daten werden vom Caller übergeben. `optimize.js` hat keine Store-Imports mehr.

---

## Aktuelle Signatur

```js
// optimize.js (IST)
generateOptimizeProposal(activityId, simResultsText = '', config, aiClient)
```

## Neue Signatur

```js
// optimize.js (SOLL)
generateOptimizeProposal({ erfahrungsprompt, erkenntnisse, feedbacks, simResultsText, config, aiClient })
```

---

## Änderungen

### 1. `optimize.js` umschreiben

```js
// Keine Store-Imports mehr

export async function generateOptimizeProposal({ erfahrungsprompt, erkenntnisse, feedbacks, simResultsText = '', config, aiClient }) {
  const feedbackText = feedbacks.length === 0
    ? 'Noch keine Bewertungen vorhanden.'
    : feedbacks.map(f => {
        const lines = [`[${f.rating.toUpperCase()}] ${(f.message_content || '').slice(0, 300)}`];
        if (f.comment) lines.push(`Kommentar: ${f.comment}`);
        if (f.improved_text) lines.push(`Verbesserter Vorschlag: ${f.improved_text.slice(0, 300)}`);
        return lines.join('\n');
      }).join('\n---\n');

  const erkenntnisText = erkenntnisse.length === 0
    ? 'Keine Erkenntnisse vorhanden.'
    : erkenntnisse.map(e => `- ${e.content}`).join('\n');

  const instructions = `Du bist Experte für pädagogisches Prompt-Engineering an einer IGS (Klasse 9).
Deine Aufgabe: Erstelle einen verbesserten Erfahrungsprompt basierend auf Feedback-Daten.

Der Erfahrungsprompt ist ein kurzer Zusatz zum globalen Systemprompt – aktivitätsspezifisch, max. 200 Wörter.
Er wiederholt den Systemprompt NICHT, sondern ergänzt ihn mit konkreten Hinweisen für diese Aufgabe.

Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Blöcke:
{
  "erfahrungsprompt_neu": "...",
  "kausalkette": [
    { "problem": "...", "ursache": "...", "aenderung": "..." }
  ]
}`;

  const userMessage = `Globaler Systemprompt:\n${config.content}\n\n` +
    `Aktueller Erfahrungsprompt:\n${erfahrungsprompt || '(noch keiner)'}\n\n` +
    `Feedback zu KI-Antworten dieser Aufgabe:\n${feedbackText}\n\n` +
    (simResultsText ? `Simulations-Ergebnisse (frisch):\n${simResultsText}\n\n` : '') +
    `Bisherige Erkenntnisse:\n${erkenntnisText}\n\n` +
    `Erstelle einen verbesserten Erfahrungsprompt für diese Aufgabe.`;

  const parsed = await aiClient.jsonCall(instructions, userMessage, config.model, { timeout: 120_000 });
  if (!parsed.erfahrungsprompt_neu || !Array.isArray(parsed.kausalkette))
    throw new Error('Unvollständige KI-Antwort');

  return {
    erfahrungsprompt_alt: erfahrungsprompt || '',
    erfahrungsprompt_neu: parsed.erfahrungsprompt_neu,
    kausalkette:          parsed.kausalkette,
  };
}
```

### 2. Aufrufer aktualisieren

**routes/erfahrungsprompt.js** — POST `/optimize-prompt`

```diff
+import { getActiveErfahrungsprompt } from '../stores/prompt.js';
+import { getErkenntnisse } from '../stores/criteria.js';
+import { getFeedbackByActivity } from '../stores/feedback.js';
 import { generateOptimizeProposal } from '../optimize.js';

 // im Handler:
 const { activityId } = req;
+const erf          = getActiveErfahrungsprompt(activityId);
+const erkenntnisse = getErkenntnisse(activityId);
+const feedbacks    = getFeedbackByActivity(activityId);
-const result = await generateOptimizeProposal(activityId, '', config, aiClient);
+const result = await generateOptimizeProposal({
+  erfahrungsprompt: erf?.content || null,
+  erkenntnisse,
+  feedbacks,
+  simResultsText: '',
+  config,
+  aiClient,
+});
```

**routes/simulation.js** — `generateOptimizeProposal`-Aufruf in `/one-click-optimize`

`erfahrungsprompt`, Erkenntnisse und Feedbacks müssen dort ebenfalls geholt werden (oder sind bereits vorhanden).

```diff
+import { getErkenntnisse } from '../stores/criteria.js';
+import { getFeedbackByActivity } from '../stores/feedback.js';

 // im One-Click-Handler, nach den Simulationen:
+const erkenntnisse = getErkenntnisse(activityId);
+const feedbacks    = getFeedbackByActivity(activityId);
-const proposal = await generateOptimizeProposal(activityId, simResultsText, config, aiClient);
+const proposal = await generateOptimizeProposal({
+  erfahrungsprompt: erf?.content || null,
+  erkenntnisse,
+  feedbacks,
+  simResultsText,
+  config,
+  aiClient,
+});
```

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `optimize.js` | Alle Store-Imports entfernen, Signatur ändern |
| `routes/erfahrungsprompt.js` | Store-Daten holen, Aufruf anpassen |
| `routes/simulation.js` | Store-Imports ergänzen, Aufruf anpassen |

---

## Testen

1. `systemctl restart moo-gpt` → kein Importfehler
2. Dashboard → Tab Optimierung → „KI-Optimierungsvorschlag generieren" → Vorschlag erscheint mit Kausalkette
3. One-Click-Optimierung → läuft durch, Vorschlag erscheint am Ende
