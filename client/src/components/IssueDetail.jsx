import { useEffect } from 'react';
import { useExplain } from '../hooks/useExplain.js';
import ExplainPanel from './ExplainPanel.jsx';
import TrackButton from './TrackButton.jsx';

export default function IssueDetail({ issue, issues, index, onClose }) {
  const { result, loading, error, streaming, streamedMarkdown, explain, cancel, reset } = useExplain();

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  return (
    <aside className="detail" aria-label="Issue detail">
      <div className="detail-head">
        <h2>{issue.title}</h2>
        <button className="btn" onClick={onClose} aria-label="Close detail">
          ✕
        </button>
      </div>
      <p className="repo">
        <a href={issue.url} target="_blank" rel="noreferrer">
          {issue.repo} #{issue.number}
        </a>
      </p>
      <p className="body">{issue.body}</p>
      <div className="detail-actions">
        {streaming ? (
          <button className="btn cancel" onClick={cancel}>
            ⏹ Cancel
          </button>
        ) : (
          <button className="btn primary" onClick={() => explain(issues[index] ?? issue)} disabled={loading}>
            {loading && !streaming ? 'Thinking…' : 'Explain this issue'}
          </button>
        )}
        <TrackButton issue={issue} />
      </div>
      <ExplainPanel result={result} error={error} streaming={streaming} streamedMarkdown={streamedMarkdown} />
    </aside>
  );
}
