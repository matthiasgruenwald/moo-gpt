const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function stripAndParseJson(text) {
  const raw = (text || '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  try {
    return JSON.parse(raw.replace(/\\([^"\\\/bfnrtu])/g, (_, c) => c));
  } catch (_) {}
  const fixedControls = raw.replace(/"(?:[^"\\]|\\.)*"/gs, match =>
    match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, ' ')
  );
  return JSON.parse(fixedControls.replace(/\\([^"\\\/bfnrtu])/g, (_, c) => c));
}

const TEXT_TIMEOUT_MS   = 30_000;
const STREAM_TIMEOUT_MS = 60_000;
const MAX_INPUT_CHARS   = 200_000;
const MAX_RETRIES       = 3;

function isTransient(err) {
  if (err?.name === 'AbortError') return true;
  const status = err?.status ?? err?.statusCode;
  return status === 429 || (status >= 500 && status < 600);
}

export class AIClient {
  constructor(provider) {
    this._provider = provider;
  }

  // Non-streaming: Input-Limit prüfen, Retry bei transienten Fehlern, konfigurierbarer Timeout
  async textCall(instructions, userMessage, model, opts = {}) {
    if (userMessage.length > MAX_INPUT_CHARS)
      throw new Error(`Input zu lang: ${userMessage.length} Zeichen (max ${MAX_INPUT_CHARS})`);

    const timeout = opts.timeout ?? TEXT_TIMEOUT_MS;
    const { timeout: _t, ...apiOpts } = opts;

    let lastErr;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await this._provider.responses.create(
          { model, instructions, input: [{ role: 'user', content: userMessage }], stream: false, ...apiOpts },
          { signal: controller.signal },
        );
        return response.output_text ?? '';
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === MAX_RETRIES - 1) throw err;
        await sleep(1000 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  // Non-streaming JSON: textCall + stripAndParseJson
  async jsonCall(instructions, userMessage, model, opts = {}) {
    const text = await this.textCall(instructions, userMessage, model, opts);
    return stripAndParseJson(text);
  }

  // Streaming: 60s Timeout, kein Retry — gibt den rohen Stream zurück
  async stream(instructions, input, model) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    return this._provider.responses.create(
      { model, instructions, input, stream: true },
      { signal: controller.signal },
    );
  }
}
