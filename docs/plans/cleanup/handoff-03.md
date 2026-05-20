# Handoff: Schritt 03 – optimize.js Store-Zugriffe entkoppeln

**Branch:** `cleanup/code-struktur`
**Ziel:** `optimize.js` holt sich keine Daten mehr selbst aus Stores; alle drei Datenquellen kommen als Parameter vom Caller.
**Verhaltensänderung:** keine.

Vollständige Analyse: `docs/plans/cleanup/03-optimize-entkoppeln.md`

---

## Was zu tun ist

### 1. `optimize.js` — alle Store-Imports entfernen, Signatur auf Objekt-Parameter umstellen

Die gesamte Datei ersetzen. Logik bleibt identisch, nur `activityId` + 3 Store-Aufrufe fallen weg:

```js
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

---

### 2. `routes/erfahrungsprompt.js` — zwei Imports ergänzen, Aufruf in Zeile 45 anpassen

`getActiveErfahrungsprompt` ist **bereits** importiert (Zeile 4). Nur `getErkenntnisse` und `getFeedbackByActivity` fehlen noch.

**Import-Block (nach Zeile 6):**
```diff
 } from '../stores/prompt.js';
+import { getErkenntnisse } from '../stores/criteria.js';
+import { getFeedbackByActivity } from '../stores/feedback.js';
 import { generateOptimizeProposal } from '../optimize.js';
```

**Handler (Zeile 43–51, POST `/optimize-prompt`):**
```diff
   const { activityId } = req;
   try {
-    const result = await generateOptimizeProposal(activityId, '', getCachedConfig(), aiClient);
+    const erf          = getActiveErfahrungsprompt(activityId);
+    const erkenntnisse = getErkenntnisse(activityId);
+    const feedbacks    = getFeedbackByActivity(activityId);
+    const result = await generateOptimizeProposal({
+      erfahrungsprompt: erf?.content || null,
+      erkenntnisse,
+      feedbacks,
+      simResultsText: '',
+      config: getCachedConfig(),
+      aiClient,
+    });
```

---

### 3. `routes/simulation.js` — zwei Imports ergänzen, beide Aufrufe anpassen

`getActiveErfahrungsprompt` ist **bereits** importiert (Zeile 3). `getErkenntnisse` und `getFeedbackByActivity` fehlen.

**Import-Block (Zeilen 4–5, nach `getActiveErfahrungsprompt`):**
```diff
+import { getErkenntnisse } from '../stores/criteria.js';
+import { getFeedbackByActivity } from '../stores/feedback.js';
```

**Aufruf 1: `/simulate`-Handler, Zeile 107** — `erfahrungsprompt` liegt bereits in Zeile 72 vor:
```diff
+      const erkenntnisse = getErkenntnisse(activityId);
+      const feedbacks    = getFeedbackByActivity(activityId);
-      const suggestion = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
+      const suggestion = await generateOptimizeProposal({
+        erfahrungsprompt: erfahrungsprompt?.content || null,
+        erkenntnisse,
+        feedbacks,
+        simResultsText,
+        config: getCachedConfig(),
+        aiClient,
+      });
```

**Aufruf 2: `/one-click-optimize`-Handler, Zeile 185** — `erfahrungsprompt` liegt ab Zeile 148 als `erf` vor:
```diff
+    const erkenntnisse = getErkenntnisse(activityId);
+    const feedbacks    = getFeedbackByActivity(activityId);
-    const proposal = await generateOptimizeProposal(activityId, simResultsText, getCachedConfig(), aiClient);
+    const proposal = await generateOptimizeProposal({
+      erfahrungsprompt: erfahrungsprompt?.content || null,
+      erkenntnisse,
+      feedbacks,
+      simResultsText,
+      config: getCachedConfig(),
+      aiClient,
+    });
```

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `optimize.js` | Store-Imports entfernen, Signatur auf Objekt-Destrukturierung |
| `routes/erfahrungsprompt.js` | 2 Imports ergänzen, Aufruf in Zeile 45 anpassen |
| `routes/simulation.js` | 2 Imports ergänzen, Aufrufe in Zeilen 107 + 185 anpassen |

---

## Testen (durch Matthias)

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → Tab Optimierung → „KI-Optimierungsvorschlag generieren" → Vorschlag erscheint mit Kausalkette
3. Dashboard → Tab Optimierung → Manuelle Simulation starten → Vorschlag erscheint am Ende
4. One-Click-Optimierung → läuft durch, Vorschlag erscheint am Ende

---

## Nach erfolgreichem Test

```bash
git add optimize.js routes/erfahrungsprompt.js routes/simulation.js
git commit -m "refactor: optimize.js Store-Zugriffe entkoppeln, Signatur auf Parameter umstellen"
git push
```
