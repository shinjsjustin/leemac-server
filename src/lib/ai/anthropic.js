// src/lib/ai/anthropic.js
// Thin server-side wrapper around the Anthropic Messages API.
// Requires Node 18+ for built-in fetch.

const { recordUsage } = require('./usage');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const MAX_ATTEMPTS = 3;
// Statuses Anthropic documents as transient and safe to retry.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
// Base delays (ms) between attempts 1→2 and 2→3. Each is randomised by ±20%.
const BASE_BACKOFFS_MS = [1000, 2000];
const MAX_RETRY_AFTER_MS = 30_000;
// Inactivity threshold once the response stream has started. Only silence
// triggers this; a slow but continuous stream is never killed.
const STREAM_INACTIVITY_MS = 60_000;

function buildHeaders() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  return {
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };
}

function buildBody(opts, stream = false) {
  const { model, system, messages, tools, max_tokens = 4096 } = opts;
  const body = { model, messages, max_tokens };
  if (system) body.system = system;
  if (tools && tools.length > 0) body.tools = tools;
  if (stream) body.stream = true;
  return JSON.stringify(body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms) {
  const factor = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  return Math.round(ms * factor);
}

// Returns how long to wait before the next retry attempt.
// Respects `retry-after` header (capped at MAX_RETRY_AFTER_MS), then falls
// back to exponential backoff with jitter.
function getWaitMs(attempt, headers) {
  const retryAfter = headers?.get?.('retry-after');
  if (retryAfter) {
    const secs = parseFloat(retryAfter);
    if (!Number.isNaN(secs) && secs > 0) {
      return Math.min(Math.round(secs * 1000), MAX_RETRY_AFTER_MS);
    }
  }
  const base = BASE_BACKOFFS_MS[attempt - 1] ?? BASE_BACKOFFS_MS[BASE_BACKOFFS_MS.length - 1];
  return withJitter(base);
}

// True for errors that are safe to retry: network failures and abort/timeout signals.
// Plain application errors (non-2xx from Anthropic) are thrown directly, not passed here.
function isRetryableError(err) {
  return err instanceof TypeError || err.name === 'AbortError' || err.name === 'TimeoutError';
}

// Wraps reader.read() with an inactivity timeout. If no bytes arrive within
// `ms` milliseconds the reader is cancelled and a descriptive error is thrown.
// The error is intentionally NOT retryable — the caller may already have
// yielded partial output.
async function timedRead(reader, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[anthropic] Stream inactivity: no data for ${ms / 1000}s`)),
      ms,
    );
  });
  try {
    const result = await Promise.race([reader.read(), timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
    throw err;
  }
}

// Non-streaming: resolves to the full Anthropic message object.
// Retries on transient failures (429/5xx/network) up to MAX_ATTEMPTS times
// with exponential backoff + jitter. Each attempt is individually timeout-gated.
//
// opts.meta (optional): { sessionId, purpose }. When present, the response's
// token usage is recorded (fire-and-forget) via usage.recordUsage. No meta →
// nothing recorded, keeping this module usable standalone.
async function createMessage(opts) {
  const timeoutMs = parseInt(process.env.ANTHROPIC_TIMEOUT_MS ?? '120000', 10);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: buildHeaders(),
        body: buildBody(opts),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text();
        if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
          throw new Error(`Anthropic API ${res.status}: ${text}`);
        }
        const waitMs = getWaitMs(attempt, res.headers);
        console.warn(
          `[anthropic] createMessage attempt ${attempt}/${MAX_ATTEMPTS} failed (HTTP ${res.status}); retrying in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      const message = await res.json();
      // Fire-and-forget usage capture — never awaited in the hot path.
      if (opts.meta && message?.usage) {
        recordUsage({ ...opts.meta, model: opts.model, usage: message.usage }).catch(() => {});
      }
      return message;
    } catch (err) {
      clearTimeout(timer);
      if (!isRetryableError(err) || attempt === MAX_ATTEMPTS) throw err;
      const waitMs = getWaitMs(attempt, null);
      const cause = err.name === 'AbortError' ? 'request timeout' : err.message;
      console.warn(
        `[anthropic] createMessage attempt ${attempt}/${MAX_ATTEMPTS} failed (${cause}); retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  // Every code path inside the loop either returns, throws, or continues.
}

// Streaming: async generator that yields text delta objects as they arrive,
// then a single final object containing the fully assembled message.
//
// Yields { type: 'text', text: string } for each text delta.
// Final yield: { type: 'final', message: { id, model, content, stop_reason, usage } }
//   where content is an array of assembled ContentBlocks (text or tool_use) and
//   stop_reason / usage mirror what createMessage returns.
//
// Retry semantics: if the call fails before any text delta has been yielded to
// the caller, the whole attempt is retried under the same policy as
// createMessage. If it fails after yielding, the error propagates immediately
// (the caller has already forwarded partial text and cannot un-send it).
//
// opts.meta (optional): { sessionId, purpose }. When present, the assembled
// usage (input from message_start, output from the final message_delta) is
// recorded ONCE when the stream completes (fire-and-forget). No meta → nothing
// recorded.
async function* streamMessage(opts) {
  const timeoutMs = parseInt(process.env.ANTHROPIC_TIMEOUT_MS ?? '120000', 10);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let firstDeltaYielded = false;

    try {
      const controller = new AbortController();
      const initialTimer = setTimeout(() => controller.abort(), timeoutMs);

      let res;
      try {
        res = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: buildHeaders(),
          body: buildBody(opts, true),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(initialTimer);
      }

      if (!res.ok) {
        const text = await res.text();
        if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
          throw new Error(`Anthropic API ${res.status}: ${text}`);
        }
        const waitMs = getWaitMs(attempt, res.headers);
        console.warn(
          `[anthropic] streamMessage attempt ${attempt}/${MAX_ATTEMPTS} failed (HTTP ${res.status}); retrying in ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      // ── Stream processing ──────────────────────────────────────────────────

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const assembled = { id: null, model: null, content: [], stop_reason: null, usage: null };
      // Per-block accumulators keyed by SSE index
      const blockAccumulators = [];

      outer: while (true) {
        const { done, value } = await timedRead(reader, STREAM_INACTIVITY_MS);
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete trailing line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break outer;

          let event;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'message_start':
              assembled.id = event.message?.id ?? null;
              assembled.model = event.message?.model ?? null;
              assembled.usage = event.message?.usage ?? null;
              break;

            case 'content_block_start': {
              const b = event.content_block;
              if (b.type === 'text') {
                blockAccumulators[event.index] = { type: 'text', text: b.text || '' };
              } else if (b.type === 'tool_use') {
                blockAccumulators[event.index] = {
                  type: 'tool_use',
                  id: b.id,
                  name: b.name,
                  partialJson: '',
                };
              }
              break;
            }

            case 'content_block_delta': {
              const acc = blockAccumulators[event.index];
              if (!acc) break;
              if (event.delta?.type === 'text_delta' && acc.type === 'text') {
                acc.text += event.delta.text || '';
                if (event.delta.text) {
                  firstDeltaYielded = true;
                  yield { type: 'text', text: event.delta.text };
                }
              } else if (event.delta?.type === 'input_json_delta' && acc.type === 'tool_use') {
                acc.partialJson += event.delta.partial_json || '';
              }
              break;
            }

            case 'content_block_stop': {
              const acc = blockAccumulators[event.index];
              if (!acc) break;
              if (acc.type === 'text') {
                assembled.content[event.index] = { type: 'text', text: acc.text };
              } else if (acc.type === 'tool_use') {
                let input = {};
                try { input = acc.partialJson ? JSON.parse(acc.partialJson) : {}; } catch { input = {}; }
                assembled.content[event.index] = {
                  type: 'tool_use',
                  id: acc.id,
                  name: acc.name,
                  input,
                };
              }
              break;
            }

            case 'message_delta':
              if (event.delta?.stop_reason) assembled.stop_reason = event.delta.stop_reason;
              if (event.usage) assembled.usage = { ...assembled.usage, ...event.usage };
              break;
          }
        }
      }

      // Compact sparse array (content_block_stop may leave gaps)
      assembled.content = assembled.content.filter(Boolean);

      // Fire-and-forget usage capture — recorded exactly once per completed
      // stream (input from message_start, output from the final message_delta).
      if (opts.meta && assembled.usage) {
        recordUsage({ ...opts.meta, model: opts.model, usage: assembled.usage }).catch(() => {});
      }

      yield { type: 'final', message: assembled };
      return;

    } catch (err) {
      if (firstDeltaYielded || !isRetryableError(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const waitMs = getWaitMs(attempt, null);
      const cause = err.name === 'AbortError' ? 'request timeout' : err.message;
      console.warn(
        `[anthropic] streamMessage attempt ${attempt}/${MAX_ATTEMPTS} failed (${cause}); retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  // Every code path inside the loop either yields+returns, throws, or continues.
}

module.exports = { createMessage, streamMessage };
