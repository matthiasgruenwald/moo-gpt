/**
 * Tests für prompt-builder.js — mathMode (Issue #166)
 *
 * Run: node --test test/prompt-builder-math-mode.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { buildInstructions } = await import('../prompt-builder.js');

describe('buildInstructions — mathMode', () => {
  test('mathMode "on" → Output enthält LaTeX-Anweisung', () => {
    const out = buildInstructions({
      systemContent: 'Du bist ein Lern-Assistent.',
      mathMode: 'on',
    });
    assert.ok(out.includes('LaTeX'), `Erwartete "LaTeX" in Output, bekam: ${out}`);
    assert.ok(out.includes('$...$'), `Erwartete "$...$" in Output`);
  });

  test('mathMode "off" → Output enthält keine LaTeX-Anweisung', () => {
    const out = buildInstructions({
      systemContent: 'Du bist ein Lern-Assistent.',
      mathMode: 'off',
    });
    assert.ok(!out.includes('LaTeX'), `Erwartete kein "LaTeX" in Output, bekam: ${out}`);
  });

  test('mathMode fehlt (undefined) → kein LaTeX', () => {
    const out = buildInstructions({
      systemContent: 'Du bist ein Lern-Assistent.',
    });
    assert.ok(!out.includes('LaTeX'), `Erwartete kein "LaTeX" bei fehlendem mathMode`);
  });

  test('mathMode "on" + erfahrungContent → LaTeX-Anweisung kommt nach erfahrungContent', () => {
    const out = buildInstructions({
      systemContent:    'System',
      erfahrungContent: 'Erfahrung',
      mathMode:         'on',
    });
    const erfIdx   = out.indexOf('Erfahrung');
    const latexIdx = out.indexOf('LaTeX');
    assert.ok(erfIdx  >= 0, 'erfahrungContent nicht gefunden');
    assert.ok(latexIdx >= 0, 'LaTeX-Anweisung nicht gefunden');
    assert.ok(latexIdx > erfIdx, 'LaTeX-Anweisung sollte nach erfahrungContent stehen');
  });
});
