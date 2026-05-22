# Handoff: Schritt 04 – persona-selector.js extrahieren

**Branch:** `cleanup/code-struktur`
**Ziel:** `selectPersonasForOneClick()` aus `routes/simulation.js` in eigenes Modul `persona-selector.js` auslagern.
**Verhaltensänderung:** keine.

Vollständige Analyse: `docs/plans/cleanup/04-persona-selector.md`

---

## Was zu tun ist

### 1. Neue Datei `persona-selector.js` anlegen

`selectDiverse` wird dabei aus der verschachtelten Hilfsfunktion in eine eigene Top-Level-Funktion gehoben (war in `simulation.js` als innere Funktion von `selectPersonasForOneClick` definiert):

```js
import { getTeacherPersonas, getGlobalPersonas } from './stores/persona.js';

const ONE_CLICK_FALLBACK_NAMES = ['Der Musterschüler', 'Der Stille', 'Die Pragmatikerin', 'Der Zweifler'];

function selectDiverse(pool, n) {
  if (pool.length <= n) return [...pool];
  const words   = p => new Set((p.description || p.name).toLowerCase().split(/\W+/).filter(Boolean));
  const overlap = (a, b) => {
    const wa = words(a), wb = words(b);
    let common = 0;
    wa.forEach(w => { if (wb.has(w)) common++; });
    return common / Math.max(wa.size, wb.size, 1);
  };
  const selected = [pool[0]];
  while (selected.length < n) {
    let best = null, bestScore = Infinity;
    for (const p of pool) {
      if (selected.includes(p)) continue;
      const score = Math.max(...selected.map(s => overlap(p, s)));
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (!best) break;
    selected.push(best);
  }
  return selected;
}

export function selectPersonasForOneClick(userId, count = 4) {
  const own    = getTeacherPersonas(userId);
  const global = getGlobalPersonas();

  const chosen = selectDiverse(own, count);

  if (chosen.length < count) {
    const fallbacks = ONE_CLICK_FALLBACK_NAMES
      .map(name => global.find(p => p.name === name))
      .filter(Boolean)
      .filter(p => !chosen.find(c => c.id === p.id));
    for (const p of fallbacks) {
      if (chosen.length >= count) break;
      chosen.push(p);
    }
    for (const p of global) {
      if (chosen.length >= count) break;
      if (!chosen.find(c => c.id === p.id)) chosen.push(p);
    }
  }

  return chosen.slice(0, count);
}
```

---

### 2. `routes/simulation.js` — Funktion + Konstante entfernen, Imports bereinigen

**Zeile 4** — `getTeacherPersonas` aus dem Import entfernen (wird nach der Auslagerung nicht mehr gebraucht):
```diff
-import { getAllPersonasForUser, getGlobalPersonas, getTeacherPersonas } from '../stores/persona.js';
+import { getAllPersonasForUser, getGlobalPersonas } from '../stores/persona.js';
```

**Neuen Import ergänzen** (nach Zeile 4, nach dem persona-Store-Import):
```diff
+import { selectPersonasForOneClick } from '../persona-selector.js';
```

**Zeilen 14–61 entfernen** — `ONE_CLICK_FALLBACK_NAMES`-Konstante und die gesamte `selectPersonasForOneClick`-Funktion (inkl. `selectDiverse` als innere Funktion):
```diff
-const ONE_CLICK_FALLBACK_NAMES = ['Der Musterschüler', 'Der Stille', 'Die Pragmatikerin', 'Der Zweifler'];
-
-function selectPersonasForOneClick(userId, count = 4) {
-  ...  // gesamte Funktion, Zeilen 16–61
-}
```

Der Aufruf `selectPersonasForOneClick(userId)` in Zeile 152 bleibt **identisch**.

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `persona-selector.js` | Neu anlegen |
| `routes/simulation.js` | Zeilen 14–61 entfernen, Import in Zeile 4 bereinigen, neuen Import ergänzen |

---

## Testen (durch Matthias)

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → Tab Optimierung → One-Click-Optimierung starten → Personas werden ausgewählt, Simulation läuft durch
3. Dashboard → Tab Optimierung → manuelle Simulation → Persona auswählen → Simulation starten → funktioniert noch

---

## Nach erfolgreichem Test

```bash
git add persona-selector.js routes/simulation.js
git commit -m "refactor: selectPersonasForOneClick in persona-selector.js auslagern"
git push
```
