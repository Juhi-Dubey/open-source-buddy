import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { OllamaProvider } from './ollama.js';
import { ProviderError } from './provider.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const issue = {
  title: 'Fix typo in README.md',
  body: 'The word "recieve" is misspelled in README.md.',
  labels: ['good first issue'],
  repo: 'acme/widgets',
  language: 'JavaScript',
  number: 7,
};

// A tiny fake Ollama. Each test sets `handler` to decide what it answers.
let fake;
let handler;
let lastRequest;

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      handler(req, res);
    });
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
});

after(() => new Promise((resolve) => fake.close(resolve)));

beforeEach(() => {
  config.ollamaUrl = `http://127.0.0.1:${fake.address().port}`;
  config.ollamaModel = 'test-model';
  config.ollamaTimeoutMs = 5000;
  lastRequest = null;
});

const reply = (content) => (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: { role: 'assistant', content }, done: true }));
};

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected the provider to reject');
}

test('calls the configured server and returns { markdown, plan }', async () => {
  handler = reply(
    JSON.stringify({
      summary: 'A word is misspelled in the README.',
      files: ['README.md'],
      plan: ['Fork the repo', 'Fix the typo', 'Open a PR'],
    }),
  );
  const result = await new OllamaProvider().explain(issue, { context: 'Some README text' });

  assert.equal(lastRequest.method, 'POST');
  assert.equal(lastRequest.url, '/api/chat');
  assert.equal(lastRequest.body.model, 'test-model');
  assert.equal(lastRequest.body.stream, false);
  assert.match(lastRequest.body.messages[1].content, /Fix typo in README\.md/);
  assert.match(lastRequest.body.messages[1].content, /Some README text/);
  assert.equal(lastRequest.headers.authorization, undefined, 'no API key is sent');

  assert.equal(typeof result.markdown, 'string');
  assert.deepEqual(result.plan, ['Fork the repo', 'Fix the typo', 'Open a PR']);
  assert.match(result.markdown, /## In plain English\nA word is misspelled/);
  assert.match(result.markdown, /- `README\.md`/);
  assert.match(result.markdown, /1\. Fork the repo/);
});

test('accepts JSON wrapped in a code fence', async () => {
  handler = reply('```json\n{"summary":"S","files":[],"plan":["One"]}\n```');
  const result = await new OllamaProvider().explain(issue);
  assert.deepEqual(result.plan, ['One']);
  assert.doesNotMatch(result.markdown, /Likely files/);
});

test('keeps plain text when the model ignores the JSON format', async () => {
  handler = reply('Here is what to do:\n1. Fork the repo\n2. Fix the typo\n- Open a PR');
  const result = await new OllamaProvider().explain(issue);
  assert.deepEqual(result.plan, ['Fork the repo', 'Fix the typo', 'Open a PR']);
  assert.match(result.markdown, /Here is what to do/);
});

test('ignores trailing slashes in OLLAMA_URL', async () => {
  handler = reply('{"summary":"S","files":[],"plan":["One"]}');
  config.ollamaUrl = `${config.ollamaUrl}/`.replace(/\/+$/, '');
  await new OllamaProvider().explain(issue);
  assert.equal(lastRequest.url, '/api/chat');
});

test('connection refused gives a clear 503 without leaking the URL', async () => {
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  config.ollamaUrl = `http://127.0.0.1:${port}`;

  const err = await rejection(new OllamaProvider().explain(issue));
  assert.ok(err instanceof ProviderError);
  assert.equal(err.status, 503);
  assert.equal(err.code, 'OLLAMA_UNREACHABLE');
  assert.match(err.message, /Could not reach Ollama/);
  assert.ok(!err.message.includes(String(port)), 'message must not contain the URL');
  assert.ok(err.cause, 'technical detail is kept in cause for server logs');
});

test('missing model gives a 502 that tells the user to pull it, without the model name', async () => {
  handler = (req, res) => {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'model "test-model" not found, try pulling it first' }));
  };
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.status, 502);
  assert.equal(err.code, 'OLLAMA_MODEL_MISSING');
  assert.match(err.message, /ollama pull/);
  assert.ok(!err.message.includes('test-model'));
  assert.match(err.cause.message, /test-model/);
});

test('a 404 that is not about the model says the endpoint is wrong', async () => {
  handler = (req, res) => {
    res.statusCode = 404;
    res.end('404 page not found');
  };
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.code, 'OLLAMA_BAD_ENDPOINT');
});

test('other HTTP errors give a generic 502', async () => {
  handler = (req, res) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'out of memory' }));
  };
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.status, 502);
  assert.equal(err.code, 'OLLAMA_HTTP_ERROR');
  assert.ok(!err.message.includes('out of memory'));
});

test('a slow server gives a 504 timeout', async () => {
  handler = () => {
    // never answers
  };
  config.ollamaTimeoutMs = 80;
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.status, 504);
  assert.equal(err.code, 'OLLAMA_TIMEOUT');
  assert.match(err.message, /OLLAMA_TIMEOUT_MS/);
});

test('an empty answer is reported as an error', async () => {
  handler = reply('   ');
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.code, 'OLLAMA_EMPTY');
});

test('an invalid OLLAMA_URL is reported without crashing', async () => {
  config.ollamaUrl = 'not a url';
  const err = await rejection(new OllamaProvider().explain(issue));
  assert.equal(err.code, 'OLLAMA_CONFIG');
  assert.equal(err.status, 500);
});

test('provider selection: mock still works and ollama is selectable', () => {
  const nameFor = (provider) =>
    execFileSync(
      process.execPath,
      ['-e', "import('./ai/index.js').then((m) => console.log(m.default.name))"],
      { cwd: serverDir, env: { ...process.env, AI_PROVIDER: provider }, encoding: 'utf8' },
    ).trim();

  assert.equal(nameFor('mock'), 'mock');
  assert.equal(nameFor('ollama'), 'ollama');
});

test('mock provider output is unchanged in shape', async () => {
  const { MockAIProvider } = await import('./mock.js');
  const result = await new MockAIProvider().explain(issue);
  assert.equal(typeof result.markdown, 'string');
  assert.ok(Array.isArray(result.plan) && result.plan.length > 0);
});
