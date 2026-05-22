# Handoff: Schritt 02 – criteria.js Store-Zugriff entkoppeln

**Branch:** `cleanup/code-struktur`
**Ziel:** `criteria.js` holt sich `getActiveErfahrungsprompt` nicht mehr selbst; Caller liefern `erfahrungsprompt` als Parameter.
**Verhaltensänderung:** keine.

Vollständige Analyse: `docs/plans/cleanup/02-criteria-entkoppeln.md`

---

## Was zu tun ist

### 1. `criteria.js` — Store-Import entfernen, Signaturen auf Objekt-Parameter umstellen

**Aktuell (Zeilen 1–33):**
- Zeile 1: `import { getActiveErfahrungsprompt } from './stores/prompt.js';` → **löschen**
- Zeile 5: `export async function suggestCriteriaList(activityId, config, genModel, aiClient)` → **Signatur ändern**
- Zeilen 6–8: `const erf = getActiveErfahrungsprompt(activityId); const promptSource = erf ? … : …` → `erf` kommt jetzt als `erfahrungsprompt`-Parameter rein
- Zeile 21: `export async function augmentCriteria(activityId, existingCriteria, config, aiClient)` → **Signatur ändern**
- Zeile 22: interner `suggestCriteriaList`-Aufruf anpassen

**Neue `criteria.js`:**
```js
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

---

### 2. `routes/criteria.js` — Erfahrungsprompt selbst holen, Aufruf anpassen

**Zeile 7** (nach `saveFeedback`-Import): neuen Import ergänzen:
```diff
+import { getActiveErfahrungsprompt } from '../stores/prompt.js';
```

**Zeile 22** (im POST `/criteria-suggest/:activityId`-Handler):
```diff
-    const suggestions = await suggestCriteriaList(activityId, getCachedConfig(), req.body.genModel, aiClient);
+    const erf = getActiveErfahrungsprompt(activityId);
+    const suggestions = await suggestCriteriaList({ config: getCachedConfig(), erfahrungsprompt: erf?.content || null, genModel: req.body.genModel, aiClient });
```

---

### 3. `routes/simulation.js` — `augmentCriteria`-Aufruf anpassen

**Achtung:** `erfahrungsprompt` wird aktuell erst in Zeile 147 geholt, der `augmentCriteria`-Aufruf steht aber in Zeile 136 — also **davor**. Den `getActiveErfahrungsprompt`-Aufruf nach oben (vor Zeile 136) ziehen und für beide Stellen nutzen.

**Zeile 134–136** (Beginn des try-Blocks in `/one-click-optimize`):
```diff
     const existing    = getCriteria(activityId);
-    const newCriteria = await augmentCriteria(activityId, existing, getCachedConfig(), aiClient);
+    const erf         = getActiveErfahrungsprompt(activityId);
+    const newCriteria = await augmentCriteria({ config: getCachedConfig(), erfahrungsprompt: erf?.content || null, existingCriteria: existing, aiClient });
```

**Zeile 147** (bisheriger `getActiveErfahrungsprompt`-Aufruf weiter unten):
```diff
-    const erfahrungsprompt = getActiveErfahrungsprompt(activityId);
+    const erfahrungsprompt = erf;
```

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `criteria.js` | Store-Import löschen, beide Signaturen auf Objekt-Destrukturierung umstellen |
| `routes/criteria.js` | Import ergänzen, Aufruf in Zeile 22 anpassen |
| `routes/simulation.js` | `augmentCriteria`-Aufruf (Zeile 136) + `erf`-Variable hochziehen (Zeile 147 entfällt) |

---

## Testen (durch Matthias)

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → Tab Optimierung → Kriterien → „KI schlägt Kriterien vor" → Liste erscheint
3. One-Click-Optimierung starten → läuft durch (Kriterien-Schritt im Fortschrittsbalken)

---

## Nach erfolgreichem Test

```bash
git add criteria.js routes/criteria.js routes/simulation.js
git commit -m "refactor: criteria.js Store-Zugriff entkoppeln, Signaturen auf Parameter umstellen"
git push
```
