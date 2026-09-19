"""
Entry point of the backend.

FastAPI is a Python web framework. You create one `app` object, then attach
functions to URL paths with decorators like @app.get("/api/health").
Uvicorn is the server that actually listens on a port and hands requests to `app`.
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import state
from .ai import AIError, summarize
from .browse import browse, suggestions
from .graph import build
from .models import (AnalyzeRequest, BrowseResponse, CloneInfo, FileResponse, GraphResponse,
                     RemoveResponse, SummarizeRequest, SummaryResponse, Suggestion)
from .remote import (REPOS_DIR, RemoteError, clone, clone_id_for, is_url, list_clones,
                     remove_all_clones, remove_clone)
from .scanner import ScanError

app = FastAPI(title="Repo Visualizer API")

# CORS = Cross-Origin Resource Sharing.
# The React dev server runs on http://localhost:5173 and the API on http://localhost:8000.
# Browsers block JavaScript on one origin from calling another origin unless the
# API explicitly allows it. This middleware adds the "yes, allowed" headers.
app.add_middleware(
    CORSMiddleware,
    # both spellings of "this machine": people open either one and the browser treats them as different origins
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PREVIEW_CHARS = 100_000   # the side panel shows a preview, not a 5 MB file


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/suggestions", response_model=list[Suggestion])
def get_suggestions():
    """Starting points for the welcome screen (this project, ~/Desktop, home ...)."""
    return suggestions()


@app.get("/api/browse", response_model=BrowseResponse)
def browse_dir(path: str | None = Query(None, description="Absolute directory; defaults to your home folder")):
    """List sub-directories so the UI can offer a folder picker."""
    try:
        return browse(path)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/analyze", response_model=GraphResponse)
def analyze(req: AnalyzeRequest):
    """Scan a local folder – or clone a public repository URL – and return its dependency graph."""
    target = req.path.strip()
    try:
        if is_url(target):
            root, commit = clone(target, refresh=req.refresh)
            graph = build(str(root))
            graph.source_url, graph.commit, graph.clone_id = target, commit, clone_id_for(root)
        elif target.startswith("git@"):
            raise RemoteError("Use the https:// form of the repository URL, e.g. https://github.com/owner/repo")
        else:
            graph = build(target)
    except RemoteError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    except ScanError as e:
        # 400 = the client sent something wrong (bad path); FastAPI turns this into JSON
        raise HTTPException(status_code=400, detail=str(e))
    state.remember(graph)
    return graph


@app.get("/api/file", response_model=FileResponse)
def get_file(path: str = Query(..., description="Relative path from an analysis"),
             root: str | None = Query(None, description="The `root` from the analyze response")):
    """Return the text of one analysed file, for the code preview."""
    try:
        abs_path = state.safe_file_path(root, path)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    text = abs_path.read_text(encoding="utf-8", errors="replace")
    truncated = len(text) > MAX_PREVIEW_CHARS
    return FileResponse(path=path, content=text[:MAX_PREVIEW_CHARS], truncated=truncated)


@app.post("/api/summarize", response_model=SummaryResponse)
def summarize_file(req: SummarizeRequest):
    """Plain-English summary of one file. Cached by content hash, so repeat calls are free."""
    try:
        abs_path = state.safe_file_path(req.root, req.path)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        summary, cached, model = summarize(abs_path, req.path)
    except AIError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    return SummaryResponse(summary=summary, cached=cached, model=model)


@app.get("/api/clones", response_model=list[CloneInfo])
def get_clones():
    """Repositories downloaded for URL analysis, with their size on disk."""
    return list_clones()


@app.delete("/api/clones", response_model=RemoveResponse)
def delete_clones(id: str | None = Query(None, description="Clone id from GET /api/clones"),
                  all: bool = Query(False, description="Remove every downloaded repository")):
    """Delete one downloaded repository (?id=) or all of them (?all=true)."""
    if not id and not all:
        raise HTTPException(status_code=400, detail="Pass ?id=<clone id> or ?all=true")
    try:
        if all:
            for info in list_clones():
                state.forget(Path(info.path))
            removed, freed = remove_all_clones()
        else:
            state.forget(REPOS_DIR / id)
            freed = remove_clone(id)
            removed = [id]
    except RemoteError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    return RemoveResponse(removed=removed, freed_bytes=freed)
