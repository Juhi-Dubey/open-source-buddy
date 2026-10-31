import github from '../github/index.js';

/**
 * Maximum character limit for repository documentation context.
 * Keeps LLM prompts within reasonable token limits while providing
 * sufficient setup and contribution instructions.
 */
export const MAX_CONTEXT_CHARS = 6000;

// Maximum chars per single file so one large file does not starve the other.
const MAX_FILE_CHARS = 3000;

function clip(text, max) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max)}\n[...truncated]` : value;
}

// Redact common secret patterns (tokens, keys, passwords) so they are never sent to AI providers
function redactSecrets(text) {
  return String(text || '')
    .replace(/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, '[redacted]')
    .replace(/gsk_[A-Za-z0-9_]{30,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[redacted]')
    .replace(/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]+['"]/gi, '$1: "[redacted]"');
}

/**
 * Builds RAG context for a GitHub issue by fetching available repository
 * documentation (README and CONTRIBUTING) via the GitHub provider.
 *
 * @param {object} issue - The issue object containing at least `repo` ("owner/name").
 * @returns {Promise<string>} The trimmed, sanitized repository documentation context, or empty string.
 */
export async function buildContext(issue) {
  if (!issue || typeof issue.repo !== 'string') {
    return '';
  }

  const [owner, name] = issue.repo.trim().split('/');
  if (!owner || !name) {
    return '';
  }

  // Fetch README and CONTRIBUTING in parallel; handle missing files or errors without crashing.
  const [readme, contributing] = await Promise.all([
    github.getRepoFile(owner, name, 'README.md').catch(() => null),
    github.getRepoFile(owner, name, 'CONTRIBUTING.md').catch(() => null),
  ]);

  const sections = [];
  if (typeof readme === 'string' && readme.trim()) {
    sections.push(`--- README.md ---\n${clip(readme, MAX_FILE_CHARS)}`);
  }
  if (typeof contributing === 'string' && contributing.trim()) {
    sections.push(`--- CONTRIBUTING.md ---\n${clip(contributing, MAX_FILE_CHARS)}`);
  }

  if (sections.length === 0) {
    return '';
  }

  const combined = sections.join('\n\n');
  const safeText = redactSecrets(combined);
  return clip(safeText, MAX_CONTEXT_CHARS);
}
