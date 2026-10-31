import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { GroqProvider } from './groq.js';
import { MockAIProvider } from './mock.js';
import { ProviderError } from './provider.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_KEY = 'gsk_test_not_a_real_key_123456';

const issue = {
  title: 'Fix typo in README.md',
  body: 'The word "recieve" is misspelled in README.md.',
  labels: ['good first issue'],
  repo: 'acme/widgets',
  language: 'JavaScript',
  number: 7,
};

// Every test replaces fetch, so nothing here touches the network.
const realFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  config.groqApiKey = FAKE_KEY;
  config.groqModel = 'test-model';
  config.groqTimeoutMs = 5000;
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(responder) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return responder(url, init);
  };
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const completion = (content) => jsonResponse({ choices: [{ index: 0, message: { role: 'assistant', content } }] });

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected the provider to reject');
}

test('calls Groq with the key and returns { markdown, plan }', async () => {
  stubFetch(() =>
    completion(
      JSON.stringify({
        summary: 'A word is misspelled in the README.',
        files: ['README.md'],
        plan: ['Fork the repo', 'Fix the typo', 'Open a PR'],
      }),
    ),
  );
  const result = await new GroqProvider().explain(issue, { context: 'Some README text' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(calls[0].body.model, 'test-model');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.match(calls[0].body.messages[1].content, /Fix typo in README\.md/);
  assert.match(calls[0].body.messages[1].content, /Some README text/);
  assert.ok(!JSON.stringify(calls[0].body).includes(FAKE_KEY), 'key is only in the header, never the body');

  assert.equal(typeof result.markdown, 'string');
  assert.deepEqual(result.plan, ['Fork the repo', 'Fix the typo', 'Open a PR']);
  assert.match(result.markdown, /## In plain English\nA word is misspelled/);
  assert.match(result.markdown, /- `README\.md`/);
  assert.match(result.markdown, /1\. Fork the repo/);
});

test('result has the same shape as the mock provider', async () => {
  stubFetch(() => completion('{"summary":"S","files":["a.js"],"plan":["One","Two"]}'));
  const real = await new GroqProvider().explain(issue);
  const mock = await new MockAIProvider().explain(issue);
  assert.deepEqual(Object.keys(real).sort(), Object.keys(mock).sort());
  assert.equal(typeof real.markdown, 'string');
  assert.ok(Array.isArray(real.plan));
  assert.ok(real.markdown.startsWith('# Explaining: '));
});

test('accepts JSON wrapped in a code fence', async () => {
  stubFetch(() => completion('```json\n{"summary":"S","files":[],"plan":["One"]}\n```'));
  const result = await new GroqProvider().explain(issue);
  assert.deepEqual(result.plan, ['One']);
  assert.doesNotMatch(result.markdown, /Likely files/);
});

test('keeps plain text when the model ignores the JSON format', async () => {
  stubFetch(() => completion('Here is what to do:\n1. Fork the repo\n2. Fix the typo\n- Open a PR'));
  const result = await new GroqProvider().explain(issue);
  assert.deepEqual(result.plan, ['Fork the repo', 'Fix the typo', 'Open a PR']);
  assert.match(result.markdown, /Here is what to do/);
});

test('missing key gives a clear configuration error and makes no request', async () => {
  config.groqApiKey = '';
  stubFetch(() => assert.fail('must not call Groq without a key'));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.ok(err instanceof ProviderError);
  assert.equal(err.code, 'GROQ_NOT_CONFIGURED');
  assert.equal(err.status, 500);
  assert.match(err.message, /GROQ_API_KEY/);
  assert.equal(calls.length, 0);
});

test('a rejected key gives a 502 and never echoes the key', async () => {
  stubFetch(() => jsonResponse({ error: { message: `Invalid API Key ${FAKE_KEY}` } }, 401));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.status, 502);
  assert.equal(err.code, 'GROQ_AUTH');
  assert.match(err.message, /GROQ_API_KEY/);
  assert.ok(!err.message.includes(FAKE_KEY));
  assert.ok(!err.cause.message.includes(FAKE_KEY), 'key is redacted from the logged detail too');
  assert.match(err.cause.message, /\[redacted\]/);
});

test('rate limit gives a 429 with a retry message', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'Rate limit reached' } }, 429));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.status, 429);
  assert.equal(err.code, 'GROQ_RATE_LIMIT');
  assert.match(err.message, /try again/i);
});

test('a bad model name points at GROQ_MODEL without echoing the model', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'The model `test-model` does not exist' } }, 404));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.code, 'GROQ_MODEL_ERROR');
  assert.match(err.message, /GROQ_MODEL/);
  assert.ok(!err.message.includes('test-model'));
});

test('Groq server errors give a 502 and hide the raw body', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'internal secret detail' } }, 503));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.status, 502);
  assert.equal(err.code, 'GROQ_UNAVAILABLE');
  assert.ok(!err.message.includes('internal secret detail'));
});

test('other HTTP errors give a generic 502', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'nope' } }, 422));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.status, 502);
  assert.equal(err.code, 'GROQ_HTTP_ERROR');
});

test('no network gives a clear 503', async () => {
  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.status, 503);
  assert.equal(err.code, 'GROQ_UNREACHABLE');
  assert.match(err.message, /Could not reach Groq/);
});

test('a slow answer gives a 504 timeout', async () => {
  config.groqTimeoutMs = 60;
  stubFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );
  // AbortSignal.timeout() uses an unref'd timer; a real request holds a socket
  // open, but this fake does not, so keep the event loop alive until it fires.
  const keepAlive = setTimeout(() => {}, 2000);
  const err = await rejection(new GroqProvider().explain(issue));
  clearTimeout(keepAlive);
  assert.equal(err.status, 504);
  assert.equal(err.code, 'GROQ_TIMEOUT');
  assert.match(err.message, /GROQ_TIMEOUT_MS/);
});

test('an empty answer is reported as an error', async () => {
  stubFetch(() => completion('   '));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.code, 'GROQ_EMPTY');
});

test('a reply without choices is reported as an error', async () => {
  stubFetch(() => jsonResponse({ choices: [] }));
  const err = await rejection(new GroqProvider().explain(issue));
  assert.equal(err.code, 'GROQ_EMPTY');
});

test('provider selection works for mock, groq, ollama and the gemini stub', () => {
  const run = (provider, code) =>
    execFileSync(process.execPath, ['-e', code], {
      cwd: serverDir,
      env: { ...process.env, AI_PROVIDER: provider, GROQ_API_KEY: '' },
      encoding: 'utf8',
    }).trim();

  const nameOf = "import('./ai/index.js').then((m) => console.log(m.default.name))";
  assert.equal(run('mock', nameOf), 'mock');
  assert.equal(run('groq', nameOf), 'groq');
  assert.equal(run('ollama', nameOf), 'ollama');
  assert.equal(run('gemini', nameOf), 'gemini');

  // The remaining stub still reports "not implemented" (the route turns this into HTTP 501).
  const stubCode =
    "import('./ai/index.js').then((m) => m.default.explain({ title: 't' })).catch((e) => console.log(e.code))";
  assert.equal(run('gemini', stubCode), 'NOT_IMPLEMENTED');

  // Groq selected without a key must not crash at startup, only fail at request time.
  const noKeyCode =
    "import('./ai/index.js').then((m) => m.default.explain({ title: 't' })).catch((e) => console.log(e.code))";
  assert.equal(run('groq', noKeyCode), 'GROQ_NOT_CONFIGURED');

  const bad = () => run('nonsense', nameOf);
  assert.throws(bad, /Unknown AI_PROVIDER/);
});

test('mock provider still returns { markdown, plan }', async () => {
  const result = await new MockAIProvider().explain(issue);
  assert.equal(typeof result.markdown, 'string');
  assert.ok(Array.isArray(result.plan) && result.plan.length > 0);
});
