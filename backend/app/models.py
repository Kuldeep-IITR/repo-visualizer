"""
Pydantic schemas = the JSON contract between backend and frontend.

Pydantic classes do three things for us:
  1. validate incoming request bodies (bad input -> automatic 422 with a clear message)
  2. serialise our Python objects to JSON in the exact shape we promised
  3. feed the auto-generated docs at /docs so the frontend dev can see every field
"""
from pydantic import BaseModel, Field


# ------------------------------------------------------------ requests
class AnalyzeRequest(BaseModel):
    path: str = Field(..., description="Absolute path to a local repository", examples=["/home/you/project"])


class SummarizeRequest(BaseModel):
    path: str = Field(..., description="File path relative to the analysed root", examples=["src/main.py"])


# ------------------------------------------------------------ graph pieces
class Loc(BaseModel):
    total: int
    code: int
    comment: int
    blank: int


class Node(BaseModel):
    id: str                      # relative path, unique -> doubles as React Flow node id
    label: str                   # file name only, shown on the node
    path: str                    # same as id, kept separate for clarity in the UI
    language: str
    loc: Loc
    complexity: int
    bloated: bool
    external_imports: list[str]  # stdlib / npm / pip packages – no edges for these


class Edge(BaseModel):
    id: str                      # "source->target"
    source: str                  # importer
    target: str                  # imported file
    circular: bool = False       # part of an import cycle -> drawn red


class Stats(BaseModel):
    files: int
    edges: int
    total_loc: int
    cycles: int
    languages: dict[str, int]    # {"python": 30, "javascript": 12}
    truncated: bool = False      # True if the scanner hit its file cap – graph is partial
    max_files: int = 0           # the cap, so the UI can say "showing first N files"


# ------------------------------------------------------------ responses
class GraphResponse(BaseModel):
    root: str
    stats: Stats
    nodes: list[Node]
    edges: list[Edge]


class FileResponse(BaseModel):
    path: str
    content: str
    truncated: bool


class SummaryResponse(BaseModel):
    summary: str
    cached: bool
    model: str


# ------------------------------------------------------------ folder browser
class DirEntry(BaseModel):
    name: str
    path: str                    # absolute
    is_repo: bool                # has a .git folder -> highlighted as a good pick


class BrowseResponse(BaseModel):
    path: str                    # the directory being listed (absolute)
    parent: str | None           # None at filesystem root
    entries: list[DirEntry]      # sub-directories only, hidden ones excluded


class Suggestion(BaseModel):
    label: str
    path: str
