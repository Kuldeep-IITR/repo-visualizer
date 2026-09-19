"""
Entry point of the backend.

FastAPI is a Python web framework. You create one `app` object, then attach
functions to URL paths with decorators like @app.get("/api/health").
Uvicorn is the server that actually listens on a port and hands requests to `app`.
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import state
from .ai import AIError, summarize
from .browse import browse, suggestions
from .graph import build
from .models import (AnalyzeRequest, BrowseResponse, FileResponse, GraphResponse,
                     SummarizeRequest, SummaryResponse, Suggestion)
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
    """Scan a local repository and return its dependency graph."""
    try:
        graph = build(req.path)
    except ScanError as e:
        # 400 = the client sent something wrong (bad path); FastAPI turns this into JSON
        raise HTTPException(status_code=400, detail=str(e))
    state.remember(graph)
    return graph


@app.get("/api/file", response_model=FileResponse)
def get_file(path: str = Query(..., description="Relative path from the last analysis")):
    """Return the text of one analysed file, for the code preview."""
    try:
        abs_path = state.safe_file_path(path)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    text = abs_path.read_text(encoding="utf-8", errors="replace")
    truncated = len(text) > MAX_PREVIEW_CHARS
    return FileResponse(path=path, content=text[:MAX_PREVIEW_CHARS], truncated=truncated)


@app.post("/api/summarize", response_model=SummaryResponse)
def summarize_file(req: SummarizeRequest):
    """Plain-English summary of one file. Cached by content hash, so repeat calls are free."""
    try:
        abs_path = state.safe_file_path(req.path)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    try:
        summary, cached, model = summarize(abs_path, req.path)
    except AIError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    return SummaryResponse(summary=summary, cached=cached, model=model)
