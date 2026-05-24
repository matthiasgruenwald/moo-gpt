/**
 * Tests für AIClient — Breaking Change #60
 * textCall und jsonCall müssen { text, usage } zurückgeben.
 *
 * Provider wird per DI gemockt — kein echter API-Call.
 *
 * Run: node --test test/ai-client.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AIClient } from '../ai-client.js';

function makeProvider(outputText, usage = { input_tokens: 5, output_tokens: 3 }) {
  return {
    responses: {
      create: async () => ({ output_text: outputText, usage }),
    },
  };
}

describe('AIClient#textCall', () => {
  test('gibt { text, usage } zurück', async () => {
    const client = new AIClient(makeProvider('Hallo Welt'));
    const result = await client.textCall('System', 'User', 'gpt-test');

    assert.equal(typeof result, 'object', 'Rückgabe muss ein Objekt sein');
    assert.equal(result.text, 'Hallo Welt');
    assert.deepEqual(result.usage, { input_tokens: 5, output_tokens: 3 });
  });

  test('text ist leerer String wenn output_text fehlt', async () => {
    const provider = { responses: { create: async () => ({ usage: {} }) } };
    const client = new AIClient(provider);
    const result = await client.textCall('System', 'User', 'gpt-test');

    assert.equal(result.text, '');
  });

  test('usage ist null wenn provider kein usage liefert', async () => {
    const provider = { responses: { create: async () => ({ output_text: 'ok' }) } };
    const client = new AIClient(provider);
    const result = await client.textCall('System', 'User', 'gpt-test');

    assert.equal(result.usage, null);
  });
});

describe('AIClient#jsonCall', () => {
  test('gibt { text: parsedObject, usage } zurück', async () => {
    const json = { suggestion: 'Verbesserter Prompt', score: 4 };
    const client = new AIClient(makeProvider(JSON.stringify(json)));
    const result = await client.jsonCall('System', 'User', 'gpt-test');

    assert.equal(typeof result, 'object', 'Rückgabe muss ein Objekt sein');
    assert.deepEqual(result.text, json);
    assert.deepEqual(result.usage, { input_tokens: 5, output_tokens: 3 });
  });

  test('text ist geparste JSON, nicht der Raw-String', async () => {
    const client = new AIClient(makeProvider('{"key":"value"}'));
    const result = await client.jsonCall('System', 'User', 'gpt-test');

    assert.equal(result.text.key, 'value', 'text.key muss geparst sein');
    assert.notEqual(result.text, '{"key":"value"}', 'darf kein Raw-String sein');
  });

  test('wirft bei ungültigem JSON', async () => {
    const client = new AIClient(makeProvider('kein json'));
    await assert.rejects(
      () => client.jsonCall('System', 'User', 'gpt-test'),
      /SyntaxError|JSON/i
    );
  });
});
