import Markdown from './Markdown.jsx';
import CopyPlanButton from './CopyPlanButton.jsx';

export default function ExplainPanel({ result, error, streaming, streamedMarkdown }) {
  if (error) {
    return (
      <div className="error" role="alert">
        {error}
      </div>
    );
  }

  // While streaming, show the partial markdown so far.
  if (streaming && streamedMarkdown) {
    return (
      <section className="explain" aria-label="AI explanation (streaming)">
        <div className="explain-head">
          <span className="provider streaming-indicator">Streaming…</span>
        </div>
        <Markdown text={streamedMarkdown} />
      </section>
    );
  }

  if (!result) return null;

  return (
    <section className="explain" aria-label="AI explanation">
      <div className="explain-head">
        <span className="provider">AI provider: {result.provider}</span>
        <CopyPlanButton plan={result.plan} />
      </div>
      <Markdown text={result.markdown} />
    </section>
  );
}
