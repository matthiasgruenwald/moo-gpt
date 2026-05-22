# Schritt 02: criteria.js – Store-Zugriff entkoppeln

**Problem:** `criteria.js` holt sich `getActiveErfahrungsprompt(activityId)` selbst aus dem Store. Das macht die Funktion schwerer testbar und koppelt sie an die Store-Schicht.

**Lösung:** Caller übergeben den Erfahrungsprompt als Parameter. `criteria.js` hat keinen Store-Import mehr.

---

## Aktuelle Signaturen

```js
// criteria.js (IST)
suggestCriteriaList(activityId, config, genModel, aiClient)
augmentCriteria(activityId, existingCriteria, config, aiClient)
```

## Neue Signaturen

```js
// criteria.js (SOLL)
suggestCriteriaList({ config, erfahrungsprompt, genModel, aiClient })
augmentCriteria({ config, erfahrungsprompt, existingCriteria, aiClient })
```

---

## Änderungen

### 1. `criteria.js` umschreiben

```js
// Kein Import mehr
const DEFAULT_GEN_MODEL = 'gpt-4.1-nano';

export async function suggestCriteriaList({ config, erfahrungsprompt, genModel, aiClient }) {
  const promptSource = erfahrungsprompt
    ? `Aufgabenprompt:\n${erfahrungsprompt}`
    : `Systemprompt:\n${config.content}`;
  const result = await aiClient.jsonCall(
    `Du leitest Bewertungskriterien für eine KI-Tutoring-Anwendung aus einem Prompt ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "criteria": ["Kriterium 1", "Kriterium 2", ...] }
Leite 5–8 präzise, prüfbare Kriterien ab. Formuliere sie als positive Aussagen (was die KI TUN soll).`,
    promptSource,
    genModel || DEFAULT_GEN_MODEL
  );
  return result.criteria || [];
}

export async function augmentCriteria({ config, erfahrungsprompt, existingCriteria, aiClient }) {
  const suggestions = await suggestCriteriaList({ config, erfahrungsprompt, genModel: undefined, aiClient });
  if (!existingCriteria.length) return suggestions;

  const existingTexts = existingCriteria.map(c => c.content.toLowerCase());
  return suggestions.filter(s => {
    const words = s.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    return !existingTexts.some(e => {
      const matches = words.filter(w => e.includes(w)).length;
      return matches >= Math.max(2, words.length * 0.5);
    });
  });
}
```

### 2. Aufrufer aktualisieren

**routes/criteria.js** — POST `/criteria-suggest/:activityId`

```diff
+import { getActiveErfahrungsprompt } from '../stores/prompt.js';
 import { suggestCriteriaList } from '../criteria.js';

 // im Handler:
+const erf = getActiveErfahrungsprompt(activityId);
-const suggestions = await suggestCriteriaList(activityId, config, genModel, aiClient);
+const suggestions = await suggestCriteriaList({ config, erfahrungsprompt: erf?.content || null, genModel, aiClient });
```

**routes/simulation.js** — `augmentCriteria`-Aufruf in `/one-click-optimize`

`erfahrungsprompt` ist dort bereits vorhanden (aus dem bestehenden `getActiveErfahrungsprompt`-Aufruf).

```diff
-const newCriteria = await augmentCriteria(activityId, existingCriteria, config, aiClient);
+const newCriteria = await augmentCriteria({ config, erfahrungsprompt: erf?.content || null, existingCriteria, aiClient });
```

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `criteria.js` | Store-Import entfernen, Signaturen ändern |
| `routes/criteria.js` | Erfahrungsprompt selbst holen, Aufruf anpassen |
| `routes/simulation.js` | `augmentCriteria`-Aufruf anpassen |

---

## Testen

1. `systemctl restart moo-gpt` → kein Importfehler
2. Dashboard → Tab Optimierung → Manuelle Simulation → Bewertungskriterien → „KI schlägt Kriterien vor" → Liste erscheint
3. One-Click-Optimierung starten → läuft durch (Kriterien-Schritt erscheint im Fortschrittsbalken)
