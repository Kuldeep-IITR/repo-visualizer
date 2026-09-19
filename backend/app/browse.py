"""
Folder browser for the "Browse…" dialog in the UI.

New users don't know what to type into the path box, so the frontend lets them
click through directories instead. This only ever lists DIRECTORIES (never
files), skips hidden ones, and marks the ones that contain a .git folder.
The tool runs on your own machine against your own disk, so there is nothing
here that `ls` wouldn't show you.
"""
from pathlib import Path

from .models import BrowseResponse, DirEntry, Suggestion

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent   # the repo-visualizer checkout itself


def suggestions() -> list[Suggestion]:
    """Starting points shown on the welcome screen."""
    home = Path.home()
    out = [Suggestion(label="This project (demo)", path=str(PROJECT_ROOT))]
    for name in ("Desktop", "Documents", "Projects", "projects", "code", "dev", "src", "repos"):
        d = home / name
        if d.is_dir():
            out.append(Suggestion(label=f"~/{name}", path=str(d)))
    out.append(Suggestion(label="Home", path=str(home)))
    # small, well-known public repositories that clone in a few seconds
    out += [
        Suggestion(label="psf/requests", path="https://github.com/psf/requests", kind="remote"),
        Suggestion(label="pallets/flask", path="https://github.com/pallets/flask", kind="remote"),
        Suggestion(label="expressjs/express", path="https://github.com/expressjs/express", kind="remote"),
    ]
    return out


def browse(path_str: str | None) -> BrowseResponse:
    path = Path(path_str).expanduser() if path_str else Path.home()
    if not path.is_absolute():
        raise ValueError("Path must be absolute")
    path = path.resolve()
    if not path.is_dir():
        raise FileNotFoundError(f"Not a directory: {path}")

    entries: list[DirEntry] = []
    try:
        for child in sorted(path.iterdir(), key=lambda c: c.name.lower()):
            if not child.is_dir() or child.name.startswith(".") or child.is_symlink():
                continue
            entries.append(DirEntry(name=child.name, path=str(child), is_repo=(child / ".git").is_dir()))
    except PermissionError:
        pass   # show an empty listing rather than a 500

    parent = None if path.parent == path else str(path.parent)
    return BrowseResponse(path=str(path), parent=parent, entries=entries)
