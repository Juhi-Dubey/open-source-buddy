# Open Source Buddy

An AI-assisted web app that helps beginners **find, understand and start** their first open source contribution.

- Browse and search issues, filter by language and topic
- Check a repo's health before you invest a weekend (last merged PR, maintainer response time, CONTRIBUTING.md)
- Press **Explain this issue** to get a plain-English summary, likely files and a starting plan
- Save issues for later, switch between light and dark themes

This repo is the starter project for the **Hacktoberfest Hack Day at NIT Jamshedpur**. See [CONTRIBUTING.md](CONTRIBUTING.md) to take part.

## Run it

You need **Node.js 20 or newer** (works on Windows, macOS and Linux). No database and no API keys are needed.

```bash
git clone <your-fork-url>
cd open-source-buddy
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` starts the Express API (port 3001) and the Vite client (port 5173) together.

## Mock mode vs live mode

| | Mock (default) | Live |
|---|---|---|
| GitHub data | Local sample JSON in `server/github/mockData/` | Real GitHub REST API |
| Needs internet | No | Yes |
| UI hint | Yellow **Sample data** banner | No banner |

To change modes, copy `.env.example` to `.env` and edit it:

```bash
cp .env.example .env      # on Windows: copy .env.example .env
```

- `GITHUB_MODE=live` uses the real GitHub API. It works without a token (60 requests/hour). Add `GITHUB_TOKEN` for more.
- `AI_PROVIDER=mock` (default) builds the explanation from the issue's own title, labels and body. No network needed.
- `AI_PROVIDER=groq` generates the explanation with a real model on Groq. It needs a free API key, see [Using Groq](#using-groq).
- `AI_PROVIDER=ollama` generates the explanation with a model running on your own machine. No API key needed, see [Using a local Ollama model](#using-a-local-ollama-model).
- `gemini` is not implemented yet.

Keys and tokens live only in the server's `.env` file. They are never sent to the browser.

## Using a local Ollama model

[Ollama](https://ollama.com) runs open models locally, so **Explain this issue** works without any external AI API key.

1. Install Ollama and download a model once: `ollama pull llama3.2`
2. Make sure Ollama is running (the desktop app does this, or run `ollama serve`).
3. In `.env` set `AI_PROVIDER=ollama`, then restart `npm run dev`.

| Variable | Default | Meaning |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Address of the Ollama server. Change it if Ollama uses another port or runs on another machine. |
| `OLLAMA_MODEL` | `llama3.2` | Any model you have pulled (`ollama list` shows them). Larger models write better explanations but are slower. |
| `OLLAMA_TIMEOUT_MS` | `120000` | How long to wait for an answer. The first request can be slow while the model loads. |

The server calls Ollama's `/api/chat` endpoint. If Ollama is not running, the model is missing or the request times out, the explanation panel shows a message that says what to fix. These values are read by the server only and are never sent to the browser.

## Using Groq

[Groq](https://groq.com) hosts open models behind a fast API and has a free tier.

1. Create a key at <https://console.groq.com/keys>.
2. Copy `.env.example` to `.env` (if you have not yet) and set:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=your-key-here
GROQ_MODEL=llama-3.3-70b-versatile   # optional, this is the default
GROQ_TIMEOUT_MS=30000                # optional, this is the default
```

3. Restart `npm run dev` and press **Explain this issue**. The panel shows `AI provider: groq`.

The key is read by the Express server only. It is sent to Groq in an `Authorization` header and is never returned to the browser, written to logs or included in error messages. `.env` is git-ignored, so do not commit it.

If something is wrong, the panel shows a short message instead of crashing:

| Message says | Fix |
|---|---|
| Groq is not configured | Set `GROQ_API_KEY` in `.env` and restart the server |
| Groq rejected the API key | Check the key was copied completely and has not been revoked |
| The Groq rate limit was reached | Wait a moment and try again (free tier limits apply) |
| Groq does not accept the configured model | Check the spelling of `GROQ_MODEL` against the Groq model list |
| Could not reach Groq / took too long | Check your connection, or raise `GROQ_TIMEOUT_MS` |

## Project structure

```
open-source-buddy/
├── client/                  React + Vite frontend
│   └── src/
│       ├── App.jsx          page layout and shared state
│       ├── api.js           all calls to the backend
│       ├── components/      cards, filters, detail panel, sidebar ...
│       ├── hooks/           data and theme hooks
│       ├── styles/          CSS files
│       └── utils/           small helpers
├── server/                  Node.js + Express backend
│   ├── index.js             app entry point
│   ├── config.js            reads .env
│   ├── routes/              /api/issues, /api/repos, /api/explain, /api/saved
│   ├── ai/                  AI provider interface + mock + Groq + Ollama (Gemini is a stub)
│   ├── github/              GitHub provider interface + mock + live
│   ├── lib/                 filtering, pagination, health score, saved-issue storage
│   ├── auth/                who is the current user
│   ├── middleware/          Express middleware
│   └── data/saved.json     saved issues (created automatically, git-ignored)
├── .github/                 pull request template
├── CONTRIBUTING.md
└── .env.example
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/issues` | List issues. Query: `q`, `language`, `topic`, `sort`, `page` |
| GET | `/api/repos/:owner/:name/health` | Repo health metrics and score |
| POST | `/api/explain` | Body `{ "issue": {...} }`, returns the AI explanation |
| GET / POST / DELETE | `/api/saved` | List, add (`POST`) or remove (`DELETE /api/saved/:id`) saved issues |

## License

[MIT](LICENSE)
