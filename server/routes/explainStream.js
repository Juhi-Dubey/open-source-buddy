import { Router } from 'express';
import ai from '../ai/index.js';
import { buildContext } from '../ai/rag.js';

const router = Router();

// POST /api/explain/stream
// Streams the AI explanation to the browser as Server-Sent Events.
// Each chunk is a `data:` line with a JSON payload:
//   { type: "chunk",    text: "..." }   – a piece of markdown to append
//   { type: "done",     provider: "..." } – the stream finished
//   { type: "error",    error: "..." }    – something went wrong
router.post('/', async (req, res) => {
  const { issue } = req.body || {};
  if (!issue || !issue.title) {
    return res.status(400).json({ error: 'Body must include an issue with a title' });
  }

  // --- SSE headers ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: don't buffer
  });

  /** Send one SSE event. */
  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  // If the client disconnects mid-stream, stop the generator.
  let cancelled = false;
  req.on('close', () => {
    cancelled = true;
  });

  try {
    const context = await buildContext(issue);

    for await (const chunk of ai.explainStream(issue, { context })) {
      if (cancelled) break;
      send({ type: 'chunk', text: chunk });
    }

    if (!cancelled) {
      send({ type: 'done', provider: ai.name });
    }
  } catch (err) {
    if (!cancelled) {
      const message =
        err.code === 'NOT_IMPLEMENTED'
          ? 'This AI provider does not support streaming yet.'
          : err.message || 'An unexpected error occurred.';
      send({ type: 'error', error: message });
    }
  } finally {
    res.end();
  }
});

export default router;
