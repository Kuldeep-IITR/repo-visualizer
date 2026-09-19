"""
The backend remembers the most recent analysis so /api/file and /api/summarize
only need a relative path. One process, one user, so a module-level variable is
enough – no database or session handling needed.
"""
from pathlib import Path

from .models import GraphResponse

current: GraphResponse | None = None
current_root: Path | None = None
current_files: set[str] = set()


def remember(graph: GraphResponse) -> None:
    global current, current_root, current_files
    current = graph
    current_root = Path(graph.root)
    current_files = {n.id for n in graph.nodes}


def safe_file_path(rel: str) -> Path:
    """
    Turn a relative path from the client into an absolute one we are allowed to read.
    Raises LookupError if nothing is analysed yet or the file is not part of it.
    Because we only accept ids that came out of the scanner, "../../etc/passwd"
    can never match – that is the whole security check.
    """
    if current_root is None:
        raise LookupError("Analyse a repository first")
    if rel not in current_files:
        raise LookupError(f"Unknown file: {rel}")
    return current_root / rel


def forget(path: Path) -> None:
    """Called when a cached clone is deleted: drop the analysis if it was the current one."""
    global current, current_root, current_files
    if current_root is not None and current_root.resolve() == path.resolve():
        current, current_root, current_files = None, None, set()
