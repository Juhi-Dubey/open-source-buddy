import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, MAX_CONTEXT_CHARS } from './rag.js';
import { MockAIProvider } from './mock.js';
import github from '../github/index.js';

test('buildContext returns empty string for missing or invalid issue', async () => {
  assert.equal(await buildContext(null), '');
  assert.equal(await buildContext(undefined), '');
  assert.equal(await buildContext({}), '');
  assert.equal(await buildContext({ repo: '' }), '');
  assert.equal(await buildContext({ repo: 'invalid-repo-without-slash' }), '');
});

test('buildContext fetches README and CONTRIBUTING for a known repository', async () => {
  const issue = {
    title: 'Search box loses focus',
    repo: 'sample-org/pixel-notes',
  };
  const context = await buildContext(issue);

  assert.ok(typeof context === 'string');
  assert.ok(context.includes('README.md'), 'must include README section');
  assert.ok(context.includes('npm install'), 'must include README content');
  assert.ok(context.includes('CONTRIBUTING.md'), 'must include CONTRIBUTING section');
  assert.ok(context.includes('Run the tests before you push'), 'must include CONTRIBUTING content');
});

test('buildContext handles missing files without crashing', async () => {
  // sample-org/campus-planner has no CONTRIBUTING.md in mock data
  const issueWithNoContrib = {
    title: 'Fix timetable view',
    repo: 'sample-org/campus-planner',
  };
  const context = await buildContext(issueWithNoContrib);

  assert.ok(context.includes('README.md'));
  assert.ok(context.includes('campus-planner'));
  assert.ok(!context.includes('CONTRIBUTING.md'));

  // Completely unknown repo returns empty string without throwing
  const unknownIssue = {
    title: 'Unknown issue',
    repo: 'unknown-org/does-not-exist',
  };
  const emptyContext = await buildContext(unknownIssue);
  assert.equal(emptyContext, '');
});

test('buildContext trims context to MAX_CONTEXT_CHARS', async () => {
  const originalGetRepoFile = github.getRepoFile;
  try {
    // Stub getRepoFile to return huge documentation
    github.getRepoFile = async () => 'A'.repeat(5000);

    const issue = { repo: 'sample-org/large-repo' };
    const context = await buildContext(issue);

    assert.ok(context.length <= MAX_CONTEXT_CHARS + 20, `context length ${context.length} should not exceed limit`);
    assert.ok(context.includes('[...truncated]'));
  } finally {
    github.getRepoFile = originalGetRepoFile;
  }
});

test('buildContext redacts sensitive tokens or secrets', async () => {
  const originalGetRepoFile = github.getRepoFile;
  try {
    github.getRepoFile = async (_owner, _name, path) =>
      path.includes('CONTRIBUTING')
        ? 'Secret token: ghp_123456789012345678901234567890123456 and api_key: "my-secret-key-12345"'
        : 'Regular README content';

    const issue = { repo: 'sample-org/secrets-test' };
    const context = await buildContext(issue);

    assert.ok(!context.includes('ghp_123456789012345678901234567890123456'));
    assert.ok(!context.includes('my-secret-key-12345'));
    assert.ok(context.includes('[redacted]'));
  } finally {
    github.getRepoFile = originalGetRepoFile;
  }
});

test('mock provider incorporates repository-specific setup when context is present', async () => {
  const issue = {
    title: 'Typo in docs',
    repo: 'sample-org/pixel-notes',
    body: 'There is a typo.',
    labels: ['documentation'],
    number: 12,
  };
  const context = await buildContext(issue);
  assert.ok(context.includes('npm install'));

  const provider = new MockAIProvider();
  const result = await provider.explain(issue, { context });

  assert.equal(typeof result.markdown, 'string');
  assert.ok(Array.isArray(result.plan));
  // The plan should mention the repo-specific setup instruction
  const setupStep = result.plan.find((step) => step.includes('npm install'));
  assert.ok(setupStep, `Plan should mention repo setup command: ${JSON.stringify(result.plan)}`);
  assert.ok(result.markdown.includes('npm install'));
});

test('mock provider streaming also mentions repo-specific setup', async () => {
  const issue = {
    title: 'Pattern matching bug',
    repo: 'sample-org/rusty-grep',
    body: 'Bug in regex.',
    labels: ['bug'],
    number: 5,
  };
  const context = await buildContext(issue);
  assert.ok(context.includes('cargo run'));

  const provider = new MockAIProvider();
  let fullText = '';
  for await (const chunk of provider.explainStream(issue, { context })) {
    fullText += chunk;
  }

  assert.ok(fullText.includes('cargo run'), 'Streamed markdown should mention cargo run setup');
});

test('mock provider falls back cleanly when no context is provided', async () => {
  const issue = {
    title: 'Generic task',
    repo: 'sample-org/pixel-notes',
    body: 'Just a task.',
    labels: [],
    number: 1,
  };
  const provider = new MockAIProvider();
  const result = await provider.explain(issue);

  assert.ok(result.plan[1].includes('Read CONTRIBUTING.md and run the project locally.'));
  assert.ok(!result.markdown.includes('Repository setup:'));
});

