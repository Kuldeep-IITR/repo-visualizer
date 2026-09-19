# Repository Structure Analysis & Visualisation System — Fast-Track Plan

Goal: scan a local Git repo → file-dependency graph with metrics → interactive React Flow
canvas → click a file for a cached AI summary. Built for the resume, so: full feature set,
minimum ceremony.

Estimated time: ~10–12 hours of work, 6 sessions of ~2 hours. At 2–3 hours/day that is 4–5 days.

What we skip on purpose (not asked about in interviews, not visible on a resume):
- pytest suites and fixture repos → we test by running the app on a real repo instead
- docker-compose, CI, linters
- folder grouping, PNG export, dark mode, config files
- TypeScript on the frontend (plain JSX is faster to write)

What we keep because it IS resume/interview material:
- Clean backend layering (scanner → parser → resolver → metrics → API)
- Python `ast` based import extraction (shows you know static analysis, not just regex)
- Pydantic schemas and auto-generated API docs
- React Flow custom nodes + auto layout
- AI integration with a content-hash cache (shows cost awareness)
- Circular-dependency detection (a graph algorithm you can talk about)
- A README with a screenshot/GIF

---

## 1. Stack

| Layer     | Choice                                  |
|-----------|-----------------------------------------|
| Backend   | Python 3.12, FastAPI, Uvicorn, Pydantic |
| Parsing   | `ast` for Python; regex for JS/TS and C/C++ |
| Metrics   | own LoC counter, `radon` for complexity |
| Ignores   | `pathspec` to honour `.gitignore`       |
| AI        | Gemini free tier via `google-genai`     |
| Cache     | SQLite (built-in `sqlite3`), key = SHA-256 of file content |
| Frontend  | React + Vite (JSX), `@xyflow/react` (React Flow v12), `@dagrejs/dagre` for layout |

---

## 2. Folder structure

```
self_project/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, all routes
│   │   ├── models.py        # Pydantic schemas
│   │   ├── scanner.py       # walk repo, apply ignores, skip binaries
│   │   ├── parsers.py       # extract_imports(path, text) for py / js / c
│   │   ├── resolver.py      # import string → file path in repo
│   │   ├── metrics.py       # LoC breakdown + complexity
│   │   ├── graph.py         # orchestrates everything, finds cycles
│   │   └── ai.py            # Gemini call + SQLite cache
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── layout.js        # dagre helper
│       └── components/
│           ├── RepoInput.jsx
│           ├── GraphCanvas.jsx
│           ├── FileNode.jsx
│           └── SidePanel.jsx
├── .gitignore
├── PLAN.md
└── README.md
```

---

## 3. JSON contract

`POST /api/analyze`  `{ "path": "/abs/path/to/repo" }` →

```json
{
  "root": "/abs/path/to/repo",
  "stats": { "files": 42, "edges": 61, "total_loc": 5120, "cycles": 1 },
  "nodes": [{
    "id": "src/main.py", "label": "main.py", "path": "src/main.py",
    "language": "python",
    "loc": { "total": 120, "code": 90, "comment": 10, "blank": 20 },
    "complexity": 7, "bloated": false,
    "external_imports": ["fastapi", "os"]
  }],
  "edges": [{ "id": "src/main.py->src/graph.py", "source": "src/main.py", "target": "src/graph.py", "circular": false }]
}
```

`GET /api/file?path=src/main.py` → `{ "content": "...", "truncated": false }`
`POST /api/summarize` `{ "path": "src/main.py" }` → `{ "summary": "...", "cached": true }`

Backend remembers the last analysed root, so the other two endpoints only need the relative path.

---

## 4. Sessions

### Session 1 — Skeleton + scanner  (~2 h)
- `git init`, `.gitignore`, backend venv + deps, Vite frontend + deps.
- FastAPI `/api/health`; React page that calls it (proves CORS).
- `scanner.py`: walk dir, default ignores + `.gitignore`, skip binaries and files > 1 MB, reject bad paths.
- Quick check: print the file list for this project itself.

### Session 2 — Parsing, resolution, metrics  (~2 h)
- `parsers.py`: Python via `ast` (incl. relative imports), JS/TS via regex (`import`, `require`, `import()`), C/C++ via `#include "..."`.
- `resolver.py`: `app.graph` → `app/graph.py` / `__init__.py`; `./utils` → `utils.js` / `utils/index.js`; `"foo.h"` → same-dir lookup. Unresolved → `external_imports`.
- `metrics.py`: total/code/comment/blank lines, `radon` complexity for Python, keyword-count fallback for others, `bloated` flag (LoC > 500 or complexity > 20).

### Session 3 — API + graph assembly  (~1.5 h)
- `models.py` schemas, `graph.py` orchestration, cycle detection (DFS on the edge list).
- Routes `/api/analyze`, `/api/file`, in-memory cache of last analysis.
- Verify on the `/docs` page against a real repo.

### Session 4 — Frontend canvas  (~2 h)
- `RepoInput` → analyze → state.
- `layout.js` with dagre; `GraphCanvas` with `<ReactFlow>`, `<Controls>`, `<MiniMap>`, `<Background>`.
- `FileNode`: colour by language, LoC badge, red border if bloated; circular edges drawn red.
- Click a node → highlight its neighbours, dim the rest.

### Session 5 — Side panel + AI  (~2 h)
- `SidePanel`: path, language, LoC breakdown, complexity, imports / imported-by, code preview from `/api/file`.
- `ai.py`: Gemini call with "Explain what this code does in 3 simple sentences", truncate big files, SQLite cache by content hash.
- `/api/summarize`; "Explain with AI" button → spinner → summary with a "cached" badge; readable error on missing key / rate limit.

### Session 6 — Search + README + ship  (~1.5 h)
- Search box that highlights matching nodes.
- Stats bar (files, edges, total LoC, cycles).
- `run.sh` that starts both servers.
- README: what it does, architecture diagram (text), screenshot/GIF, setup steps, API table.
- Push to GitHub.

---

## 5. Risks (short)

| Risk                         | Handling                                              |
|------------------------------|-------------------------------------------------------|
| Huge repo freezes canvas     | cap at 1500 files, warn user                          |
| Arbitrary file reads         | `/api/file` refuses paths outside the analysed root   |
| Gemini rate limit            | cache first, truncate input, show 429 message         |
| Odd encodings                | open with `errors="replace"`, skip binaries           |

---

## 6. Session 1 commands

```bash
cd ~/Desktop/self_project
git init
python3 -m venv backend/.venv && source backend/.venv/bin/activate
pip install fastapi "uvicorn[standard]" pydantic pathspec radon google-genai python-dotenv
npm create vite@latest frontend -- --template react
cd frontend && npm install @xyflow/react @dagrejs/dagre
```
