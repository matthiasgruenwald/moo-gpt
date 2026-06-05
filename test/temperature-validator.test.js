/**
 * Unit-Tests für normalizeTemperature und validateAssistTemperature — Issue #191
 *
 * Run: node --test test/temperature-validator.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTemperature, validateAssistTemperature, validateChatTemperature } from '../validators.js';

describe('normalizeTemperature', () => {
  test('null → null', () => {
    assert.strictEqual(normalizeTemperature(null), null);
  });

  test('undefined → null', () => {
    assert.strictEqual(normalizeTemperature(undefined), null);
  });

  test("'' → null", () => {
    assert.strictEqual(normalizeTemperature(''), null);
  });

  test('0 → 0 (untere Grenze)', () => {
    assert.strictEqual(normalizeTemperature(0), 0);
  });

  test('1 → 1 (obere Grenze)', () => {
    assert.strictEqual(normalizeTemperature(1), 1);
  });

  test('0.5 → 0.5', () => {
    assert.strictEqual(normalizeTemperature(0.5), 0.5);
  });

  test('"0.7" als String → 0.7', () => {
    assert.strictEqual(normalizeTemperature('0.7'), 0.7);
  });

  test('-0.1 → Fehlermeldung (kein stilles Clampen)', () => {
    // normalizeTemperature gibt bei out-of-range den rohen Zahlenwert zurück —
    // die Ablehnung ist Aufgabe von validateAssistTemperature/validateChatTemperature.
    // Hier testen wir nur, dass der Wert numerisch konvertiert wird.
    assert.strictEqual(normalizeTemperature(-0.1), -0.1);
  });

  test('1.1 → 1.1 (out-of-range, aber normalizeTemperature klemmt nicht)', () => {
    assert.strictEqual(normalizeTemperature(1.1), 1.1);
  });
});

describe('validateAssistTemperature', () => {
  test('null → null (kein Fehler)', () => {
    assert.strictEqual(validateAssistTemperature(null), null);
  });

  test('undefined → null (kein Fehler)', () => {
    assert.strictEqual(validateAssistTemperature(undefined), null);
  });

  test("'' → null (kein Fehler)", () => {
    assert.strictEqual(validateAssistTemperature(''), null);
  });

  test('0 → null (gültig, Untergrenze)', () => {
    assert.strictEqual(validateAssistTemperature(0), null);
  });

  test('1 → null (gültig, Obergrenze)', () => {
    assert.strictEqual(validateAssistTemperature(1), null);
  });

  test('0.5 → null (gültig)', () => {
    assert.strictEqual(validateAssistTemperature(0.5), null);
  });

  test('-0.1 → Fehlermeldung', () => {
    assert.ok(typeof validateAssistTemperature(-0.1) === 'string');
  });

  test('1.1 → Fehlermeldung', () => {
    assert.ok(typeof validateAssistTemperature(1.1) === 'string');
  });

  test('"abc" → Fehlermeldung (NaN)', () => {
    assert.ok(typeof validateAssistTemperature('abc') === 'string');
  });

  test('Fehlermeldung enthält "assist_temperature"', () => {
    const msg = validateAssistTemperature(2);
    assert.ok(msg.includes('assist_temperature'), `Fehlermeldung: "${msg}"`);
  });
});

describe('validateChatTemperature (Regression — unverändertes Verhalten)', () => {
  test('null → null', () => assert.strictEqual(validateChatTemperature(null), null));
  test('undefined → null', () => assert.strictEqual(validateChatTemperature(undefined), null));
  test("'' → null", () => assert.strictEqual(validateChatTemperature(''), null));
  test('0 → null', () => assert.strictEqual(validateChatTemperature(0), null));
  test('1 → null', () => assert.strictEqual(validateChatTemperature(1), null));
  test('-0.1 → Fehlermeldung', () => assert.ok(typeof validateChatTemperature(-0.1) === 'string'));
  test('1.1 → Fehlermeldung', () => assert.ok(typeof validateChatTemperature(1.1) === 'string'));
  test('"abc" → Fehlermeldung', () => assert.ok(typeof validateChatTemperature('abc') === 'string'));
});
