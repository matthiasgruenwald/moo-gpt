/**
 * Tests für prompt-builder.js — Paramternamen aufgabe/aufgabenprompt (Issue #172)
 *
 * Run: node --test test/prompt-builder-params.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { buildInstructions } = await import('../prompt-builder.js');

describe('buildInstructions — aufgabe & aufgabenprompt', () => {
  test('aufgabenprompt wird in den Output eingebaut', () => {
    const out = buildInstructions({
      systemContent:  'System',
      aufgabenprompt: 'Schreibe einen Brief.',
    });
    assert.ok(out.includes('Schreibe einen Brief.'), `aufgabenprompt fehlt im Output: ${out}`);
  });

  test('aufgabe wird in den Output eingebaut', () => {
    const out = buildInstructions({
      systemContent: 'System',
      aufgabe:       'Löse die Gleichung x²=4.',
    });
    assert.ok(out.includes('Löse die Gleichung x²=4.'), `aufgabe fehlt im Output: ${out}`);
  });

  test('aufgabe erscheint nach aufgabenprompt im Output', () => {
    const out = buildInstructions({
      systemContent:  'System',
      aufgabenprompt: 'Hinweis-Prompt',
      aufgabe:        'Aufgabenstellung',
    });
    const promptIdx = out.indexOf('Hinweis-Prompt');
    const aufgabeIdx = out.indexOf('Aufgabenstellung');
    assert.ok(promptIdx >= 0,  'aufgabenprompt nicht gefunden');
    assert.ok(aufgabeIdx >= 0, 'aufgabe nicht gefunden');
    assert.ok(aufgabeIdx > promptIdx, 'aufgabe soll nach aufgabenprompt stehen');
  });

  test('fehlende aufgabe und aufgabenprompt (undefined) → kein Leerstring-Artefakt', () => {
    const out = buildInstructions({ systemContent: 'System' });
    assert.equal(out, 'System');
  });

  test('null-Werte für aufgabe und aufgabenprompt werden ignoriert', () => {
    const out = buildInstructions({
      systemContent:  'System',
      aufgabenprompt: null,
      aufgabe:        null,
    });
    assert.equal(out, 'System');
  });
});
