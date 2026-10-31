async function request(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new Error(message);
  }
  return res.json();
}

export const getStatus = () => request('/api/status');

export function getIssues(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) qs.set(key, value);
  });
  return request(`/api/issues?${qs}`);
}

export const getHealth = (repo) => request(`/api/repos/${repo}/health`);

export const explainIssue = (issue) =>
  request('/api/explain', { method: 'POST', body: JSON.stringify({ issue }) });

export const getSaved = () => request('/api/saved');

export const saveIssue = (issue) =>
  request('/api/saved', { method: 'POST', body: JSON.stringify({ issue }) });

export const unsaveIssue = (id) => request(`/api/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * Stream an AI explanation via Server-Sent Events.
 * @param {object}        issue    – the issue to explain
 * @param {AbortSignal}   signal   – pass to cancel the stream
 * @param {(text:string)=>void} onChunk – called with each piece of text
 * @returns {Promise<{ provider: string }>} resolves when the stream ends
 */
export async function explainIssueStream(issue, { signal, onChunk }) {
  const res = await fetch('/api/explain/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issue }),
    signal,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* no JSON body */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let provider = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by double newlines.
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete tail

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.type === 'chunk') {
          onChunk(payload.text);
        } else if (payload.type === 'done') {
          provider = payload.provider;
        } else if (payload.type === 'error') {
          throw new Error(payload.error);
        }
      }
    }
  }

  return { provider };
}
