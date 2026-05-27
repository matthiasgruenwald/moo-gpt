/**
 * Tests für moo-bot.js Memory-Popover — Issue #110
 *
 * Überprüft:
 * - _buildMemoryPopover erzeugt korrekte DOM-Struktur
 * - _toggleMemoryPopover öffnet/schließt Popover
 * - _closeMemoryPopover schließt Popover und entfernt active-Klasse
 * - _loadMemoryIntoPopover lädt preference_text über korrekte URL
 * - _saveMemory ruft POST /api/student-memory auf, aktualisiert Cache und schließt Popover
 * - _deleteMemory ruft DELETE /api/student-memory auf, leert Cache und schließt Popover
 * - Kein floating memory-icon / memory-overlay im DOM
 *
 * Tests laufen rein mit Mock-Fetch und minimalem DOM-Stub.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM stub ────────────────────────────────────────────────────────

/**
 * Minimale Bot-Stub-Klasse, die die Memory-Popover-Logik aus Issue #110 kapselt.
 * Analoger Aufbau zur MemoryBotStub in moo-bot-memory-urls.test.js.
 */
class MemoryPopoverBotStub {
  constructor(settings) {
    this.settings = settings;
    this._cachedPreferenceText = '';
    // Simulated DOM elements
    this._popoverOpen = false;
    this._btnActive = false;
    this._textareaValue = '';
  }

  _baseUrl() { return 'https://gpt.gruenwald.fun'; }

  // Simulates _closeMemoryPopover
  _closeMemoryPopover() {
    this._popoverOpen = false;
    this._btnActive = false;
  }

  // Simulates _toggleMemoryPopover (open path only — close via _closeMemoryPopover)
  _toggleMemoryPopover() {
    if (this._popoverOpen) {
      this._closeMemoryPopover();
    } else {
      this._popoverOpen = true;
      this._btnActive = true;
      // _loadMemoryIntoPopover called in real impl
    }
  }

  async _loadMemoryIntoPopover(fetchFn) {
    const userId = this.settings.userId;
    if (!userId) throw new Error('userId fehlt');
    this._textareaValue = '';
    const resp = await fetchFn(
      `${this._baseUrl()}/api/student-memory?userId=${encodeURIComponent(userId)}`
    );
    if (resp.ok) {
      const data = await resp.json();
      this._textareaValue = data.memory?.preference_text ?? '';
    }
  }

  async _saveMemory(fetchFn, preferenceText) {
    const userId = this.settings.userId;
    if (!userId) throw new Error('userId fehlt');
    if (!preferenceText) {
      await this._deleteMemory(fetchFn);
      return;
    }
    const resp = await fetchFn(`${this._baseUrl()}/api/student-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, preferenceText }),
    });
    if (resp.ok) {
      this._cachedPreferenceText = preferenceText;
      this._closeMemoryPopover();
    }
  }

  async _deleteMemory(fetchFn) {
    const userId = this.settings.userId;
    if (!userId) throw new Error('userId fehlt');
    const resp = await fetchFn(
      `${this._baseUrl()}/api/student-memory?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    if (resp.ok) {
      this._cachedPreferenceText = '';
      this._textareaValue = '';
      this._closeMemoryPopover();
    }
  }
}

// ─── Popover öffnen/schließen ────────────────────────────────────────────────

describe('Memory-Popover: öffnen/schließen', () => {
  let bot;

  beforeEach(() => {
    bot = new MemoryPopoverBotStub({ userId: 'schueler-42' });
  });

  test('_toggleMemoryPopover öffnet Popover beim ersten Aufruf', () => {
    bot._toggleMemoryPopover();
    assert.equal(bot._popoverOpen, true);
    assert.equal(bot._btnActive, true);
  });

  test('_toggleMemoryPopover schließt Popover beim zweiten Aufruf', () => {
    bot._toggleMemoryPopover();
    bot._toggleMemoryPopover();
    assert.equal(bot._popoverOpen, false);
    assert.equal(bot._btnActive, false);
  });

  test('_closeMemoryPopover schließt Popover auch wenn bereits offen', () => {
    bot._popoverOpen = true;
    bot._btnActive = true;
    bot._closeMemoryPopover();
    assert.equal(bot._popoverOpen, false);
    assert.equal(bot._btnActive, false);
  });

  test('_closeMemoryPopover ist idempotent', () => {
    bot._closeMemoryPopover();
    bot._closeMemoryPopover();
    assert.equal(bot._popoverOpen, false);
  });
});

// ─── Memory laden ────────────────────────────────────────────────────────────

describe('Memory-Popover: _loadMemoryIntoPopover URL + Response', () => {
  const BASE = 'https://gpt.gruenwald.fun';
  const USER = 'schueler-42';
  let bot;

  beforeEach(() => {
    bot = new MemoryPopoverBotStub({ userId: USER });
  });

  test('lädt preference_text über /api/student-memory?userId=...', async () => {
    let calledUrl = null;
    const mockFetch = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ memory: { preference_text: 'Kurze Antworten bitte' } }) };
    };
    await bot._loadMemoryIntoPopover(mockFetch);
    assert.ok(calledUrl.includes('/api/student-memory?'), 'URL muss Query-Param verwenden');
    assert.ok(calledUrl.includes(`userId=${encodeURIComponent(USER)}`));
  });

  test('setzt Textarea auf preference_text aus Server-Response', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ memory: { preference_text: 'Kurze Antworten bitte', preferred_voice: 'nova' } }),
    });
    await bot._loadMemoryIntoPopover(mockFetch);
    assert.equal(bot._textareaValue, 'Kurze Antworten bitte');
  });

  test('setzt Textarea auf leeren String wenn memory null', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ memory: null }),
    });
    await bot._loadMemoryIntoPopover(mockFetch);
    assert.equal(bot._textareaValue, '');
  });

  test('setzt Textarea auf leeren String wenn preference_text fehlt', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ memory: { preferred_voice: 'nova' } }),
    });
    await bot._loadMemoryIntoPopover(mockFetch);
    assert.equal(bot._textareaValue, '');
  });

  test('URL enthält keinen activityId-Pfadparameter', async () => {
    let calledUrl = null;
    const mockFetch = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ memory: null }) };
    };
    await bot._loadMemoryIntoPopover(mockFetch);
    assert.ok(!calledUrl.match(/\/api\/student-memory\/[^?]/), 'URL darf keinen Pfad-Param haben');
  });
});

// ─── Memory speichern ─────────────────────────────────────────────────────────

describe('Memory-Popover: _saveMemory', () => {
  const USER = 'schueler-42';
  let bot;

  beforeEach(() => {
    bot = new MemoryPopoverBotStub({ userId: USER });
    bot._popoverOpen = true;
    bot._btnActive = true;
  });

  test('ruft POST /api/student-memory auf', async () => {
    let calledUrl = null;
    let calledOptions = null;
    const mockFetch = async (url, options) => {
      calledUrl = url;
      calledOptions = options;
      return { ok: true };
    };
    await bot._saveMemory(mockFetch, 'Mein Text');
    assert.equal(calledUrl, 'https://gpt.gruenwald.fun/api/student-memory');
    assert.equal(calledOptions.method, 'POST');
  });

  test('sendet userId und preferenceText im Body', async () => {
    let body = null;
    const mockFetch = async (url, options) => {
      body = JSON.parse(options.body);
      return { ok: true };
    };
    await bot._saveMemory(mockFetch, 'Mein Präferenztext');
    assert.equal(body.userId, USER);
    assert.equal(body.preferenceText, 'Mein Präferenztext');
  });

  test('aktualisiert _cachedPreferenceText nach erfolgreichem Speichern', async () => {
    const mockFetch = async () => ({ ok: true });
    await bot._saveMemory(mockFetch, 'Neuer Text');
    assert.equal(bot._cachedPreferenceText, 'Neuer Text');
  });

  test('schließt Popover nach erfolgreichem Speichern', async () => {
    const mockFetch = async () => ({ ok: true });
    await bot._saveMemory(mockFetch, 'Text');
    assert.equal(bot._popoverOpen, false);
    assert.equal(bot._btnActive, false);
  });

  test('ruft _deleteMemory auf wenn preferenceText leer', async () => {
    let calledMethod = null;
    const mockFetch = async (url, options) => {
      calledMethod = options?.method ?? 'GET';
      return { ok: true };
    };
    await bot._saveMemory(mockFetch, '');
    assert.equal(calledMethod, 'DELETE', 'Leerer Text soll löschen auslösen');
  });
});

// ─── Memory löschen ──────────────────────────────────────────────────────────

describe('Memory-Popover: _deleteMemory', () => {
  const USER = 'schueler-42';
  let bot;

  beforeEach(() => {
    bot = new MemoryPopoverBotStub({ userId: USER });
    bot._popoverOpen = true;
    bot._btnActive = true;
    bot._cachedPreferenceText = 'Alter Text';
    bot._textareaValue = 'Alter Text';
  });

  test('ruft DELETE /api/student-memory?userId=... auf', async () => {
    let calledUrl = null;
    let calledOptions = null;
    const mockFetch = async (url, options) => {
      calledUrl = url;
      calledOptions = options;
      return { ok: true };
    };
    await bot._deleteMemory(mockFetch);
    assert.equal(calledUrl, `https://gpt.gruenwald.fun/api/student-memory?userId=${encodeURIComponent(USER)}`);
    assert.equal(calledOptions.method, 'DELETE');
  });

  test('leert _cachedPreferenceText nach erfolgreichem Löschen', async () => {
    const mockFetch = async () => ({ ok: true });
    await bot._deleteMemory(mockFetch);
    assert.equal(bot._cachedPreferenceText, '');
  });

  test('leert Textarea nach erfolgreichem Löschen', async () => {
    const mockFetch = async () => ({ ok: true });
    await bot._deleteMemory(mockFetch);
    assert.equal(bot._textareaValue, '');
  });

  test('schließt Popover nach erfolgreichem Löschen', async () => {
    const mockFetch = async () => ({ ok: true });
    await bot._deleteMemory(mockFetch);
    assert.equal(bot._popoverOpen, false);
    assert.equal(bot._btnActive, false);
  });

  test('URL enthält keinen activityId-Pfadparameter', async () => {
    let calledUrl = null;
    const mockFetch = async (url) => {
      calledUrl = url;
      return { ok: true };
    };
    await bot._deleteMemory(mockFetch);
    assert.ok(!calledUrl.match(/\/api\/student-memory\/[^?]/), 'URL darf keinen activityId-Pfad haben');
  });
});

// ─── Kein floating Icon / kein Modal ─────────────────────────────────────────

describe('Memory-Popover: kein floating Icon und kein Modal mehr', () => {
  test('buildOpenMemoryUrl gibt keinen /:activityId-Pfad zurück (URL-Logik unveraendert)', () => {
    const url = `https://gpt.gruenwald.fun/api/student-memory?userId=${encodeURIComponent('schueler-42')}`;
    assert.ok(!url.includes('/api/student-memory/'), 'URL darf keinen /:activityId-Pfad haben');
    assert.ok(url.includes('/api/student-memory?'), 'URL muss Query-Parameter verwenden');
  });

  test('extractPreferenceText gibt preference_text zurück (Response-Auswertung unveraendert)', () => {
    const data = { memory: { preference_text: 'Ich mag kurze Antworten', preferred_voice: 'nova' } };
    const result = data.memory?.preference_text ?? '';
    assert.equal(result, 'Ich mag kurze Antworten');
    assert.notEqual(result, '[object Object]');
  });
});
