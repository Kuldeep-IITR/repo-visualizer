"""
Remembers recent analyses so /api/file and /api/summarize only need a relative
path plus the analysed root. Several are kept (one per open browser tab, in
practice) so two people or two tabs looking at different repositories don't
knock each other's analysis out.
"""
from collections import OrderedDict
from pathlib import Path

from .models import GraphResponse

MAX_REMEMBERED = 8

# root path (str) -> set of relative file ids that came out of the scanner
_analyses: "OrderedDict[str, set[str]]" = OrderedDict()


def remember(graph: GraphResponse) -> None:
    root = str(Path(graph.root).resolve())
    _analyses.pop(root, None)
    _analyses[root] = {n.id for n in graph.nodes}
    while len(_analyses) > MAX_REMEMBERED:
        _analyses.popitem(last=False)          # drop the oldest


def forget(path: Path) -> None:
    """Called when a cached clone is deleted."""
    _analyses.pop(str(path.resolve()), None)


def safe_file_path(root: str | None, rel: str) -> Path:
    """
    Turn (root, relative path) from the client into an absolute path we are allowed to read.
    Raises LookupError if that root was never analysed or the file is not part of it.
    Because we only accept ids that came out of the scanner, "../../etc/passwd"
    can never match – that is the whole security check.
    """
    if not _analyses:
        raise LookupError("Analyse a repository first")
    if root:
        key = str(Path(root).resolve())
        if key not in _analyses:
            raise LookupError("That analysis has expired. Analyse the repository again.")
    else:
        key = next(reversed(_analyses))        # most recent, for clients that don't send a root
    if rel not in _analyses[key]:
        raise LookupError(f"Unknown file: {rel}")
    return Path(key) / rel
