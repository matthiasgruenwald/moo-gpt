/**
 * Tests für message-formatter.js — Issue #73
 * buildInput() konvertiert DB-Nachrichten in das OpenAI Responses API Input-Array.
 *
 * Run: node --test test/message-formatter.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildInput } from '../message-formatter.js';

describe('buildInput', () => {
  test('Plaintext-Nachricht → pass-through { role, content }', () => {
    const messages = [{ role: 'user', content: 'Hallo', content_type: 'text' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{ role: 'user', content: 'Hallo' }]);
  });

  test('content_type fehlt → treat as text, pass-through', () => {
    const messages = [{ role: 'assistant', content: 'Antwort' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{ role: 'assistant', content: 'Antwort' }]);
  });

  test('image mit Base64-Data-URL → input_image mit image_url', () => {
    const b64 = 'data:image/png;base64,abc123';
    const messages = [{ role: 'user', content: b64, content_type: 'image' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_image', image_url: b64 }],
    }]);
  });

  test('task_image mit Base64-Data-URL → input_image mit image_url', () => {
    const b64 = 'data:image/jpeg;base64,xyz789';
    const messages = [{ role: 'user', content: b64, content_type: 'task_image' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_image', image_url: b64 }],
    }]);
  });

  test('image mit File-ID-Marker [image:file-xxx] → input_image mit file_id', () => {
    const messages = [{ role: 'user', content: '[image:file-abc123]', content_type: 'image' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_image', file_id: 'file-abc123' }],
    }]);
  });

  test('task_image mit File-ID-Marker [image:file-xxx] → input_image mit file_id', () => {
    const messages = [{ role: 'user', content: '[image:file-def456]', content_type: 'task_image' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_image', file_id: 'file-def456' }],
    }]);
  });

  test('pdf mit File-ID-Marker [pdf:file-xxx] → input_file mit file_id', () => {
    const messages = [{ role: 'user', content: '[pdf:file-zzz999]', content_type: 'pdf' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_file', file_id: 'file-zzz999' }],
    }]);
  });

  test('image mit [pdf:...]-Marker → input_image (image-Zweig, nicht pdf-Zweig)', () => {
    // Edge-case: content_type=image aber Inhalt beginnt mit [pdf:...] → Regex für image trifft (?:image|pdf)
    const messages = [{ role: 'user', content: '[pdf:file-qrs]', content_type: 'image' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{
      role: 'user',
      content: [{ type: 'input_image', file_id: 'file-qrs' }],
    }]);
  });

  test('pdf ohne gültigen Marker → Plaintext-Fallback', () => {
    const messages = [{ role: 'user', content: 'kein marker', content_type: 'pdf' }];
    const result = buildInput(messages);
    assert.deepEqual(result, [{ role: 'user', content: 'kein marker' }]);
  });

  test('mehrere Nachrichten gemischt → korrektes Array', () => {
    const messages = [
      { role: 'user',      content: 'Frage',              content_type: 'text' },
      { role: 'user',      content: 'data:image/png;base64,abc', content_type: 'image' },
      { role: 'assistant', content: 'Antwort',            content_type: 'text' },
    ];
    const result = buildInput(messages);
    assert.equal(result.length, 3);
    assert.deepEqual(result[0], { role: 'user', content: 'Frage' });
    assert.deepEqual(result[1], { role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,abc' }] });
    assert.deepEqual(result[2], { role: 'assistant', content: 'Antwort' });
  });
});
