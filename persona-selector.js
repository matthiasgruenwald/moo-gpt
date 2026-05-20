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
