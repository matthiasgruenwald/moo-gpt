/**
 * Tests für Issue #127 — Simulations-Orchestrierung aus Route extrahieren
 *
 * Prüft:
 * A. selectPersonasForOneClick bevorzugt eigene Personas gegenüber globalen
 * B. selectPersonasForOneClick füllt mit globalen Personas auf wenn eigene < count
 * C. runOneClickOptimization ruft onProgress mit allen erwarteten Event-Typen auf
 * D. runOneClickOptimization wirft Error wenn alle Simulationen fehlschlagen
 *
 * Run: DB_PATH=:memory: node --test test/simulation-orchestrator.test.js
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db.js';
import { createPersona } from '../stores/persona.js';
import { updateCachedConfig } from '../config-cache.js';
import { selectPersonasForOneClick, runOneClickOptimization } from '../simulation.js';

before(() => {
  initDb();
  updateCachedConfig('Du bist ein hilfreicher Lernassistent.', 'gpt-test');
});

// ---------------------------------------------------------------------------
// Mock aiClient — kontextabhängige Responses anhand des System-Prompts
// ---------------------------------------------------------------------------
const mockAiClient = {
  jsonCall: async (sysPrompt, _usr, _model) => {
    const usage = { input_tokens: 5, output_tokens: 3 };
    if (sysPrompt.includes('Bewertungskriterien'))
      return { text: { criteria: ['Stellt Rückfragen', 'Gibt keine fertigen Lösungen'] }, usage };
    if (sysPrompt.includes('Schüleräußerungen'))
      return { text: ['Äußerung 1', 'Äußerung 2', 'Äußerung 3', 'Äußerung 4'], usage };
    if (sysPrompt.includes('bewertest'))
      return { text: { overall: 'gut', score: 4, highlights: [], summary: 'Simulation OK' }, usage };
    if (sysPrompt.includes('Prompt-Engineering'))
      return { text: { erfahrungsprompt_neu: 'Verbesserter Prompt', kausalkette: [] }, usage };
    return { text: {}, usage };
  },
  textCall: async () => ({ text: 'KI-Antwort auf Schüler', usage: { input_tokens: 5, output_tokens: 3 } }),
};

// ---------------------------------------------------------------------------
// selectPersonasForOneClick
// ---------------------------------------------------------------------------
describe('selectPersonasForOneClick', () => {
  test('A — bevorzugt eigene Personas gegenüber globalen', () => {
    // 5 eigene Personas für 't-own'
    for (let i = 1; i <= 5; i++) {
      createPersona({ teacherId: 't-own', name: `Eigene Persona ${i}`, description: `Beschreibung ${i}` });
    }
    // 3 globale Personas
    for (let i = 1; i <= 3; i++) {
      createPersona({ teacherId: null, name: `Globale Persona A${i}`, description: `Global ${i}` });
    }

    const result = selectPersonasForOneClick('t-own', 4);

    assert.equal(result.length, 4, 'Soll genau 4 Personas zurückgeben');
    const ownCount = result.filter(p => p.teacher_id === 't-own').length;
    assert.equal(ownCount, 4, 'Alle 4 müssen eigene Personas sein (5 eigene → selectDiverse wählt 4)');
  });

  test('B — füllt mit globalen Personas auf wenn eigene < count', () => {
    // Nur 1 eigene Persona für 't-few'
    createPersona({ teacherId: 't-few', name: 'Einzige Eigene', description: 'Nur eine eigene' });
    // Globale Personas existieren schon aus Test A

    const result = selectPersonasForOneClick('t-few', 4);

    assert.equal(result.length, 4, 'Soll genau 4 Personas zurückgeben');
    const ownCount    = result.filter(p => p.teacher_id === 't-few').length;
    const globalCount = result.filter(p => p.teacher_id == null).length;
    assert.equal(ownCount, 1, 'Genau 1 eigene Persona');
    assert.equal(globalCount, 3, '3 globale Personas als Auffüllung');
  });
});

// ---------------------------------------------------------------------------
// runOneClickOptimization
// ---------------------------------------------------------------------------
describe('runOneClickOptimization', () => {
  test('C — ruft onProgress mit allen erwarteten Event-Typen auf', async () => {
    // Eine globale Persona sicherstellen
    createPersona({ teacherId: null, name: 'Test-Globale C', description: 'Für One-Click-Test' });

    const events = [];
    await runOneClickOptimization({
      activityId: 'act-test-c',
      userId: 't-click',
      aiClient: mockAiClient,
      onProgress: (type, data) => events.push({ type, ...data }),
      genModel: 'gpt-test',
    });

    const types = events.map(e => e.type);
    assert.ok(types.includes('criteria'),      'criteria-Event muss gesendet werden');
    assert.ok(types.includes('personas'),      'personas-Event muss gesendet werden');
    assert.ok(types.includes('sim_start'),     'sim_start-Event muss gesendet werden');
    assert.ok(types.some(t => t === 'sim_pair'), 'mindestens ein sim_pair-Event muss gesendet werden');
    assert.ok(types.includes('optimize_done'), 'optimize_done-Event muss gesendet werden');
  });

  test('D — wirft Error wenn alle Simulationen fehlschlagen', async () => {
    createPersona({ teacherId: null, name: 'Test-Globale D', description: 'Für Error-Test' });

    // augmentCriteria gelingt; runSimulation-Calls schlagen alle fehl
    const failingClient = {
      jsonCall: async (sysPrompt) => {
        if (sysPrompt.includes('Bewertungskriterien'))
          return { text: { criteria: ['k1'] }, usage: { input_tokens: 1, output_tokens: 1 } };
        throw new Error('Simulation fehlgeschlagen (Mock)');
      },
      textCall: async () => { throw new Error('Simulation fehlgeschlagen (Mock)'); },
    };

    await assert.rejects(
      () => runOneClickOptimization({
        activityId: 'act-test-d',
        userId: 't-fail',
        aiClient: failingClient,
        onProgress: () => {},
        genModel: 'gpt-test',
      }),
      /fehlgeschlagen/i,
      'Soll einen Fehler werfen wenn alle Simulationen fehlschlagen'
    );
  });
});
