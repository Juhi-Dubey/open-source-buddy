import { AIProvider } from './provider.js';

const FILE_PATTERN = /[\w./-]+\.(?:jsx?|tsx?|py|rs|go|java|css|html|md|json)\b/g;

function firstSentences(text, count = 2) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'The issue has no description yet.';
  return clean.split(/(?<=[.!?])\s+/).slice(0, count).join(' ');
}

function guessFiles(issue) {
  const found = [...new Set(`${issue.title} ${issue.body}`.match(FILE_PATTERN) || [])];
  if (found.length) return found.slice(0, 5);
  const labels = (issue.labels || []).map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes('doc'))) return ['README.md', 'docs/'];
  return ['src/', 'README.md'];
}

// Template-based explanation. No network, no keys.
export class MockAIProvider extends AIProvider {
  get name() {
    return 'mock';
  }

  async explain(issue) {
    const labels = issue.labels || [];
    const files = guessFiles(issue);
    const friendly = labels.some((l) => l.toLowerCase().includes('good first'));
    const plan = [
      `Fork **${issue.repo}** and clone your fork.`,
      'Read CONTRIBUTING.md and run the project locally.',
      `Open ${files.map((f) => `\`${f}\``).join(', ')} and find the code the issue talks about.`,
      'Reproduce the problem (or read the current text) before changing anything.',
      'Make the smallest change that solves it, on a new branch.',
      `Open a pull request and write "Closes #${issue.number ?? 'N'}" in the description.`,
    ];

    const markdown = [
      `# Explaining: ${issue.title}`,
      '',
      '## In plain English',
      firstSentences(issue.body),
      '',
      `Labels: ${labels.length ? labels.join(', ') : 'none'}. ${
        friendly ? 'This one is marked beginner friendly.' : 'Read the discussion first to judge the effort.'
      }`,
      '',
      '## Likely files',
      ...files.map((f) => `- \`${f}\``),
      '',
      '## Starting plan',
      ...plan.map((step, i) => `${i + 1}. ${step}`),
    ].join('\n');

    return { issueTitle: issue.title, markdown, plan };
  }

  // Stream the mock explanation in small chunks so the UI can show progressive
  // rendering even without a real AI backend.
  async *explainStream(issue, opts) {
    const { markdown } = await this.explain(issue, opts);
    // Split by line, yielding each line (with its newline) as a chunk.
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      yield lines[i] + (i < lines.length - 1 ? '\n' : '');
    }
  }
}
