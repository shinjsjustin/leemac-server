// src/lib/ai/anthropic.js
// Thin server-side wrapper around the Anthropic Messages API.
// Requires Node 18+ for built-in fetch.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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

// Non-streaming: resolves to the full Anthropic message object.
async function createMessage(opts) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: buildBody(opts),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }

  return res.json();
}

// Streaming: async generator that yields text delta strings.
// Caller accumulates them into a full string if needed.
async function* streamMessage(opts) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: buildBody(opts, true),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep any incomplete trailing line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }
  }
}

module.exports = { createMessage, streamMessage };
