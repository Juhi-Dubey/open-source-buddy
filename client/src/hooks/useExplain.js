import { useState, useRef, useCallback } from 'react';
import { explainIssue, explainIssueStream } from '../api.js';

export function useExplain() {
  const [state, setState] = useState({
    result: null,
    loading: false,
    error: null,
    streaming: false,        // true while chunks are arriving
    streamedMarkdown: '',     // partial text accumulated so far
  });

  // Abort controller for the current stream (if any).
  const abortRef = useRef(null);

  // ---- streaming path (preferred) ----
  const explain = useCallback(async (issue) => {
    // Cancel any in-progress stream before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ result: null, loading: true, error: null, streaming: true, streamedMarkdown: '' });

    try {
      let accumulated = '';
      const { provider } = await explainIssueStream(issue, {
        signal: controller.signal,
        onChunk(text) {
          accumulated += text;
          setState((prev) => ({ ...prev, streamedMarkdown: accumulated }));
        },
      });

      // Build a result object compatible with ExplainPanel.
      setState({
        result: { provider, markdown: accumulated, plan: [] },
        loading: false,
        error: null,
        streaming: false,
        streamedMarkdown: accumulated,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled – keep whatever text we already showed.
        setState((prev) => ({
          ...prev,
          loading: false,
          streaming: false,
          result: prev.streamedMarkdown
            ? { provider: 'cancelled', markdown: prev.streamedMarkdown, plan: [] }
            : null,
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        result: null,
        loading: false,
        error: err.message,
        streaming: false,
      }));
    }
  }, []);

  // ---- non-streaming fallback ----
  const explainClassic = useCallback(async (issue) => {
    setState({ result: null, loading: true, error: null, streaming: false, streamedMarkdown: '' });
    try {
      const result = await explainIssue(issue);
      setState({ result, loading: false, error: null, streaming: false, streamedMarkdown: '' });
    } catch (err) {
      setState({ result: null, loading: false, error: err.message, streaming: false, streamedMarkdown: '' });
    }
  }, []);

  // ---- cancel an in-progress stream ----
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ result: null, loading: false, error: null, streaming: false, streamedMarkdown: '' });
  }, []);

  return {
    ...state,
    explain,             // default to streaming
    explainClassic,      // non-streaming fallback
    cancel,
    reset,
  };
}
