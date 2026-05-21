// Tests for postMessage task context feature (Issue #37)
// Uses Node.js 22 built-in test runner (node:test)
// Tests browser logic in isolation with minimal stubs

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers shared across suites ───────────────────────────────────────────

/**
 * Build a minimal iframe stub.
 * @param {string} currentSrc - current iframe.src value
 * @param {boolean} alreadyLoaded - whether onload fires synchronously (already loaded)
 */
function makeIframe(currentSrc = 'about:blank', alreadyLoaded = false) {
  const iframe = {
    src: currentSrc,
    _loadListeners: [],
    addEventListener(event, cb) {
      if (event === 'load') this._loadListeners.push(cb);
    },
    removeEventListener() {},
    contentWindow: { postMessage: mock.fn() },
    /** Helper: simulate load event firing */
    _fireLoad() {
      for (const cb of this._loadListeners) cb();
    },
  };
  if (alreadyLoaded) {
    // Replace addEventListener so load callback fires immediately
    iframe.addEventListener = function (event, cb) {
      if (event === 'load') cb();
    };
  }
  return iframe;
}

/**
 * Minimal overlay stub.
 */
function makeOverlay() {
  return { style: { display: '' } };
}

// ─── Unit: extractImagesFromHTML ────────────────────────────────────────────
// We extract this pure logic and test it in isolation.

/**
 * Extract all <img src="..."> values from an HTML string.
 * This mirrors the extraction step in _openConfigOverlay.
 */
function extractImgSrcs(html) {
  if (!html) return [];
  // Simple regex that works in Node without DOMParser
  const srcs = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

describe('extractImgSrcs', () => {
  test('returns empty array for null input', () => {
    assert.deepEqual(extractImgSrcs(null), []);
  });

  test('returns empty array for HTML with no images', () => {
    assert.deepEqual(extractImgSrcs('<p>Hello</p>'), []);
  });

  test('extracts single image src', () => {
    const html = '<p><img src="https://example.com/a.png" alt="x"></p>';
    assert.deepEqual(extractImgSrcs(html), ['https://example.com/a.png']);
  });

  test('extracts multiple image srcs', () => {
    const html = '<img src="a.png"><img src="b.png">';
    assert.deepEqual(extractImgSrcs(html), ['a.png', 'b.png']);
  });

  test('handles single-quoted src attributes', () => {
    const html = "<img src='c.jpg'>";
    assert.deepEqual(extractImgSrcs(html), ['c.jpg']);
  });
});

// ─── Unit: blobToBase64 logic ────────────────────────────────────────────────
// In the browser this uses FileReader; here we test the contract: failed
// fetches produce null entries, successful ones produce base64 strings.

/**
 * Simulate the per-image fetch+base64 step.
 * fetchFn: (src) => Promise<Response | null>  (null = network error)
 * Returns null on any failure (to satisfy the spec: null entries not dropped).
 */
async function fetchImageAsBase64(src, fetchFn) {
  try {
    const response = await fetchFn(src);
    if (!response || !response.ok) return null;
    const blob = await response.blob();
    // In Node we can't use FileReader; simulate by reading buffer directly.
    const buf = Buffer.from(await blob.arrayBuffer());
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch {
    return null;
  }
}

/**
 * Gather base64 results for all srcs, preserving null entries.
 */
async function gatherImages(srcs, fetchFn) {
  return Promise.all(srcs.map(src => fetchImageAsBase64(src, fetchFn)));
}

describe('image loading contract', () => {
  test('returns base64 string for successful fetch', async () => {
    const buf = Buffer.from('PNG_DATA');
    const fakeFetch = async (_src) => ({
      ok: true,
      blob: async () => ({ arrayBuffer: async () => buf }),
    });
    const results = await gatherImages(['img.png'], fakeFetch);
    assert.equal(results.length, 1);
    assert.ok(results[0].startsWith('data:image/png;base64,'));
  });

  test('returns null entry for failed HTTP response (not removed)', async () => {
    const fakeFetch = async (_src) => ({ ok: false, status: 403 });
    const results = await gatherImages(['img.png'], fakeFetch);
    assert.deepEqual(results, [null]);
  });

  test('returns null entry for network error (not removed)', async () => {
    const fakeFetch = async (_src) => { throw new Error('network error'); };
    const results = await gatherImages(['img.png'], fakeFetch);
    assert.deepEqual(results, [null]);
  });

  test('preserves null for unreadable image alongside valid one', async () => {
    const buf = Buffer.from('OK');
    const fakeFetch = async (src) => {
      if (src === 'good.png') return { ok: true, blob: async () => ({ arrayBuffer: async () => buf }) };
      throw new Error('TIFF not supported');
    };
    const results = await gatherImages(['bad.tif', 'good.png'], fakeFetch);
    assert.equal(results.length, 2);
    assert.equal(results[0], null);
    assert.ok(results[1].startsWith('data:image/png;base64,'));
  });
});

// ─── Unit: postMessage dispatch logic ────────────────────────────────────────
// Models _openConfigOverlay's send-on-load behavior without a real DOM.

/**
 * Extracted postMessage dispatch logic:
 * - if `alreadyLoaded`, posts immediately to iframe.contentWindow
 * - otherwise registers load listener that posts and removes itself
 */
function schedulePostMessage(iframe, payload, alreadyLoaded) {
  if (alreadyLoaded) {
    iframe.contentWindow.postMessage(payload, '*');
    return;
  }
  function onLoad() {
    iframe.contentWindow.postMessage(payload, '*');
    iframe.removeEventListener('load', onLoad);
  }
  iframe.addEventListener('load', onLoad);
}

describe('postMessage dispatch', () => {
  test('posts immediately when iframe already loaded', () => {
    const iframe = makeIframe('http://example.com', true);
    const payload = { type: 'moogpt:taskContext', task: '<p>Hi</p>', images: [] };
    schedulePostMessage(iframe, payload, true);
    assert.equal(iframe.contentWindow.postMessage.mock.calls.length, 1);
    const [msg, origin] = iframe.contentWindow.postMessage.mock.calls[0].arguments;
    assert.deepEqual(msg, payload);
    assert.equal(origin, '*');
  });

  test('does not post before load event when iframe not yet loaded', () => {
    const iframe = makeIframe('about:blank', false);
    const payload = { type: 'moogpt:taskContext', task: null, images: [] };
    schedulePostMessage(iframe, payload, false);
    assert.equal(iframe.contentWindow.postMessage.mock.calls.length, 0);
  });

  test('posts after load event fires', () => {
    const iframe = makeIframe('about:blank', false);
    const payload = { type: 'moogpt:taskContext', task: '<b>Task</b>', images: ['data:image/png;base64,abc'] };
    schedulePostMessage(iframe, payload, false);
    iframe._fireLoad();
    assert.equal(iframe.contentWindow.postMessage.mock.calls.length, 1);
    const [msg] = iframe.contentWindow.postMessage.mock.calls[0].arguments;
    assert.deepEqual(msg, payload);
  });

  test('payload type is always moogpt:taskContext', () => {
    const iframe = makeIframe('about:blank', true);
    const payload = { type: 'moogpt:taskContext', task: null, images: [] };
    schedulePostMessage(iframe, payload, true);
    const [msg] = iframe.contentWindow.postMessage.mock.calls[0].arguments;
    assert.equal(msg.type, 'moogpt:taskContext');
  });

  test('images defaults to empty array when null', () => {
    // This tests the consumer normalization rule: images: e.data.images || []
    const raw = { type: 'moogpt:taskContext', task: null, images: null };
    const normalized = { ...raw, images: raw.images || [] };
    assert.deepEqual(normalized.images, []);
  });
});

// ─── Unit: config.js message handler logic ──────────────────────────────────
// config.js is a browser IIFE, so we test the handler logic in isolation.

/**
 * Factory that returns an object mirroring the taskContext state in config.js
 * plus the message handler function. This isolates the logic from the DOM.
 */
function makeConfigMessageHandler() {
  let taskContext = { task: null, images: [] };

  function handleMessage(event) {
    if (event.data?.type === 'moogpt:taskContext') {
      taskContext = { task: event.data.task, images: event.data.images || [] };
    }
  }

  return {
    handleMessage,
    getTaskContext: () => taskContext,
  };
}

describe('config.js message handler', () => {
  test('initialises with null task and empty images', () => {
    const { getTaskContext } = makeConfigMessageHandler();
    assert.deepEqual(getTaskContext(), { task: null, images: [] });
  });

  test('stores task and images when correct type received', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: { type: 'moogpt:taskContext', task: '<p>Aufgabe</p>', images: ['data:image/png;base64,abc'] } });
    assert.deepEqual(getTaskContext(), { task: '<p>Aufgabe</p>', images: ['data:image/png;base64,abc'] });
  });

  test('normalises missing images to empty array', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: { type: 'moogpt:taskContext', task: '<p>X</p>', images: undefined } });
    assert.deepEqual(getTaskContext().images, []);
  });

  test('ignores messages with wrong type', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: { type: 'some:other:event', task: 'IGNORED' } });
    assert.deepEqual(getTaskContext(), { task: null, images: [] });
  });

  test('ignores messages with no data', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: null });
    assert.deepEqual(getTaskContext(), { task: null, images: [] });
  });

  test('stores null images entries from payload (unreadable images)', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: { type: 'moogpt:taskContext', task: 'x', images: [null, 'data:image/png;base64,ok'] } });
    const ctx = getTaskContext();
    assert.equal(ctx.images.length, 2);
    assert.equal(ctx.images[0], null);
    assert.ok(ctx.images[1].startsWith('data:'));
  });

  test('overwrites previous context on second message', () => {
    const { handleMessage, getTaskContext } = makeConfigMessageHandler();
    handleMessage({ data: { type: 'moogpt:taskContext', task: 'first', images: [] } });
    handleMessage({ data: { type: 'moogpt:taskContext', task: 'second', images: ['data:x'] } });
    assert.equal(getTaskContext().task, 'second');
  });
});
