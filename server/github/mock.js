import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubProvider } from './provider.js';
import { filterByQuery } from '../lib/filters.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mockData');
const repos = JSON.parse(fs.readFileSync(path.join(dir, 'repos.json'), 'utf8'));
const rawIssues = JSON.parse(fs.readFileSync(path.join(dir, 'issues.json'), 'utf8'));

const DAY = 24 * 60 * 60 * 1000;

// Dates are stored as "daysAgo" so the sample data never looks stale.
const issues = rawIssues.map(({ daysAgo, repo, ...rest }) => ({
  ...rest,
  repo,
  language: repos[repo].language,
  topics: repos[repo].topics,
  createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
}));

// Serves local sample data. Works offline, needs no keys.
export class MockGitHubProvider extends GitHubProvider {
  get name() {
    return 'mock';
  }

  async listIssues({ q } = {}) {
    return filterByQuery(issues, q);
  }

  async getRepoHealth(owner, name) {
    const repo = repos[`${owner}/${name}`];
    if (!repo) return null;
    return { ...repo.health };
  }

  async getRepoFile(owner, name, filePath) {
    const repo = repos[`${owner}/${name}`];
    if (!repo) return null;
    const key = filePath.toLowerCase().includes('contributing') ? 'contributing' : 'readme';
    return repo[key] ?? null;
  }
}
