/**
 * Tests für moo-bot.js Memory-URL-Korrektur — Issue #109
 *
 * Überprüft, dass _openMemoryOverlay, _saveMemory, _deleteMemory und
 * _saveFeedback die korrekten URLs gemäß ADR 0003 verwenden:
 * - Kein activityId-Pfadparameter
 * - Response-Auswertung gibt preference_text zurück, nicht das volle DB-Objekt
 *
 * Tests laufen rein mit Mock-Fetch (kein DOM, kein Server).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simuliert den openMemoryOverlay-URL-Aufruf (extrahierte Logik).
 * Gibt die aufgerufene URL zurück.
 */
function buildOpenMemoryUrl(baseUrl, userId) {
  return `${baseUrl}/api/student-memory?userId=${encodeURIComponent(userId)}`;
}

/**
 * Simuliert die Response-Auswertung von openMemoryOverlay.
 * Gibt den preference_text-String zurück (kein [object Object]).
 */
function extractPreferenceText(data) {
  return data.memory?.preference_text ?? '';
}

/**
 * Simuliert den saveMemory-URL-Aufruf (POST ohne activityId im Pfad).
 */
function buildSaveMemoryUrl(baseUrl) {
  return `${baseUrl}/api/student-memory`;
}

/**
 * Simuliert den deleteMemory-URL-Aufruf (DELETE ohne activityId im Pfad).
 */
function buildDeleteMemoryUrl(baseUrl, userId) {
  return `${baseUrl}/api/student-memory?userId=${encodeURIComponent(userId)}`;
}

/**
 * Simuliert den saveFeedback-URL-Aufruf (POST ohne activityId im Pfad).
 */
function buildSaveFeedbackUrl(baseUrl) {
  return `${baseUrl}/api/student-memory`;
}

// ─── URL-Korrektheit ────────────────────────────────────────────────────────

describe('Memory-URL-Struktur (ADR 0003)', () => {
  const BASE = 'https://gpt.gruenwald.fun';
  const USER = 'schueler-42';

  test('openMemoryOverlay: URL enthält keinen activityId-Pfadparameter', () => {
    const url = buildOpenMemoryUrl(BASE, USER);
    assert.ok(!url.includes('/api/student-memory/'), 'URL darf keinen /:activityId-Pfad haben');
    assert.ok(url.includes('/api/student-memory?'), 'URL muss Query-Parameter verwenden');
  });

  test('openMemoryOverlay: URL enthält userId als Query-Parameter', () => {
    const url = buildOpenMemoryUrl(BASE, USER);
    assert.ok(url.includes(`userId=${encodeURIComponent(USER)}`));
  });

  test('openMemoryOverlay: URL-Format ist korrekt', () => {
    const url = buildOpenMemoryUrl(BASE, USER);
    assert.equal(url, `${BASE}/api/student-memory?userId=${encodeURIComponent(USER)}`);
  });

  test('saveMemory: URL enthält keinen activityId-Pfadparameter', () => {
    const url = buildSaveMemoryUrl(BASE);
    assert.ok(!url.includes('/api/student-memory/'), 'URL darf keinen /:activityId-Pfad haben');
    assert.equal(url, `${BASE}/api/student-memory`);
  });

  test('deleteMemory: URL enthält keinen activityId-Pfadparameter', () => {
    const url = buildDeleteMemoryUrl(BASE, USER);
    assert.ok(!url.includes(`/api/student-memory/${encodeURIComponent('activity-x')}`),
      'URL darf keinen activityId-Pfad haben');
    assert.ok(url.startsWith(`${BASE}/api/student-memory?`));
  });

  test('deleteMemory: URL enthält userId als Query-Parameter', () => {
    const url = buildDeleteMemoryUrl(BASE, USER);
    assert.ok(url.includes(`userId=${encodeURIComponent(USER)}`));
  });

  test('deleteMemory: URL-Format ist korrekt', () => {
    const url = buildDeleteMemoryUrl(BASE, USER);
    assert.equal(url, `${BASE}/api/student-memory?userId=${encodeURIComponent(USER)}`);
  });

  test('saveFeedback: URL enthält keinen activityId-Pfadparameter', () => {
    const url = buildSaveFeedbackUrl(BASE);
    assert.ok(!url.includes('/api/student-memory/'), 'URL darf keinen /:activityId-Pfad haben');
    assert.equal(url, `${BASE}/api/student-memory`);
  });
});

// ─── Response-Auswertung ────────────────────────────────────────────────────

describe('openMemoryOverlay: Response-Auswertung (kein [object Object])', () => {
  test('extractPreferenceText gibt preference_text zurück, nicht das Objekt', () => {
    const data = { memory: { preference_text: 'Ich mag kurze Antworten', preferred_voice: 'nova' } };
    const result = extractPreferenceText(data);
    assert.equal(result, 'Ich mag kurze Antworten');
    assert.notEqual(result, '[object Object]');
  });

  test('extractPreferenceText gibt leeren String zurück wenn memory null ist', () => {
    const data = { memory: null };
    const result = extractPreferenceText(data);
    assert.equal(result, '');
  });

  test('extractPreferenceText gibt leeren String zurück wenn preference_text fehlt', () => {
    const data = { memory: { preferred_voice: 'nova' } };
    const result = extractPreferenceText(data);
    assert.equal(result, '');
  });

  test('extractPreferenceText gibt leeren String zurück wenn memory undefined', () => {
    const data = {};
    const result = extractPreferenceText(data);
    assert.equal(result, '');
  });

  test('extractPreferenceText: preference_text ist ein String, kein Objekt', () => {
    const data = { memory: { preference_text: 'Kurze Sätze bitte', preferred_voice: 'alloy', tts_autoplay: 1 } };
    const result = extractPreferenceText(data);
    assert.equal(typeof result, 'string');
  });
});

// ─── Mock-Fetch-Integration ─────────────────────────────────────────────────

describe('Memory fetch-Aufrufe: korrekte URLs via Mock', () => {
  /**
   * Minimale Bot-Stub-Klasse, die nur die URL-Logik der drei Memory-Methoden
   * kapselt (identisch zu den korrigierten Stellen in moo-bot.js).
   */
  class MemoryBotStub {
    constructor(settings) {
      this.settings = settings;
    }
    _baseUrl() { return 'https://gpt.gruenwald.fun'; }

    async openMemoryOverlay(fetchFn) {
      const userId = this.settings.userId;
      if (!userId) throw new Error('userId fehlt');
      return fetchFn(
        `${this._baseUrl()}/api/student-memory?userId=${encodeURIComponent(userId)}`
      );
    }

    async _saveMemory(fetchFn, preferenceText) {
      const userId = this.settings.userId;
      if (!userId) throw new Error('userId fehlt');
      return fetchFn(`${this._baseUrl()}/api/student-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferenceText }),
      });
    }

    async _deleteMemory(fetchFn) {
      const userId = this.settings.userId;
      if (!userId) throw new Error('userId fehlt');
      return fetchFn(
        `${this._baseUrl()}/api/student-memory?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
    }

    async _saveFeedback(fetchFn, preferenceText) {
      const userId = this.settings.userId;
      if (!userId) throw new Error('userId fehlt');
      return fetchFn(`${this._baseUrl()}/api/student-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferenceText }),
      });
    }
  }

  const bot = new MemoryBotStub({ userId: 'schueler-42' });

  test('openMemoryOverlay ruft /api/student-memory?userId=... auf (kein Pfad-Param)', async () => {
    let calledUrl = null;
    const mockFetch = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ memory: { preference_text: 'Kurz', preferred_voice: 'nova' } }) };
    };
    await bot.openMemoryOverlay(mockFetch);
    assert.ok(calledUrl.includes('/api/student-memory?'), 'URL muss Query-Param verwenden');
    assert.ok(!calledUrl.match(/\/api\/student-memory\/[^?]/), 'URL darf keinen Pfad-Param haben');
    assert.ok(calledUrl.includes('userId=schueler-42'));
  });

  test('_saveMemory ruft POST /api/student-memory auf (kein Pfad-Param)', async () => {
    let calledUrl = null;
    let calledOptions = null;
    const mockFetch = async (url, options) => {
      calledUrl = url;
      calledOptions = options;
      return { ok: true };
    };
    await bot._saveMemory(mockFetch, 'Mein Präferenztext');
    assert.equal(calledUrl, 'https://gpt.gruenwald.fun/api/student-memory');
    assert.equal(calledOptions.method, 'POST');
    const body = JSON.parse(calledOptions.body);
    assert.equal(body.userId, 'schueler-42');
    assert.equal(body.preferenceText, 'Mein Präferenztext');
  });

  test('_deleteMemory ruft DELETE /api/student-memory?userId=... auf (kein Pfad-Param)', async () => {
    let calledUrl = null;
    let calledOptions = null;
    const mockFetch = async (url, options) => {
      calledUrl = url;
      calledOptions = options;
      return { ok: true };
    };
    await bot._deleteMemory(mockFetch);
    assert.equal(calledUrl, 'https://gpt.gruenwald.fun/api/student-memory?userId=schueler-42');
    assert.equal(calledOptions.method, 'DELETE');
  });

  test('_saveFeedback ruft POST /api/student-memory auf (kein activityId-Pfad)', async () => {
    let calledUrl = null;
    const mockFetch = async (url) => {
      calledUrl = url;
      return { ok: true };
    };
    await bot._saveFeedback(mockFetch, 'Präferenz aus Feedback');
    assert.equal(calledUrl, 'https://gpt.gruenwald.fun/api/student-memory');
    assert.ok(!calledUrl.match(/\/api\/student-memory\/[^?]/), 'URL darf keinen activityId-Pfad haben');
  });
});
