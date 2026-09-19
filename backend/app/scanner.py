"""
Step 1 of the pipeline: find every source file worth analysing in a repo.

Input : an absolute path to a directory.
Output: a sorted list of file paths *relative to that root* (e.g. "src/app/main.py").

Rules:
  * skip folders that are never source (node_modules, .git, venv, build output ...)
  * honour the repo's own .gitignore (via the `pathspec` library, same syntax Git uses)
  * only keep extensions we know how to parse
  * skip binary files and anything over MAX_FILE_BYTES
  * never follow symlinks (a link pointing outside the repo would let us read anything)
"""
from pathlib import Path

import pathspec

# Folders we always ignore, regardless of .gitignore.
DEFAULT_IGNORED_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "bower_components",
    ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".tox",
    "dist", "build", "out", "target", ".next", ".nuxt", "coverage",
    ".idea", ".vscode", ".cache",
}

# extension -> language name used everywhere else in the app
LANGUAGE_BY_EXT = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp",
}

MAX_FILE_BYTES = 1_000_000   # 1 MB – bigger than this is generated/minified, not hand-written
MAX_FILES = 1500             # keep the graph renderable in the browser


class ScanError(ValueError):
    """Raised for a bad root path. main.py turns it into an HTTP 400."""


def language_of(path: str) -> str | None:
    """'src/a.py' -> 'python'; unknown extension -> None."""
    return LANGUAGE_BY_EXT.get(Path(path).suffix.lower())


def _load_gitignore(root: Path) -> pathspec.PathSpec | None:
    gi = root / ".gitignore"
    if not gi.is_file():
        return None
    lines = gi.read_text(encoding="utf-8", errors="replace").splitlines()
    return pathspec.PathSpec.from_lines("gitwildmatch", lines)


def _is_binary(path: Path) -> bool:
    """Real text files almost never contain a NUL byte; binaries almost always do."""
    with path.open("rb") as f:
        return b"\x00" in f.read(4096)


def scan(root_str: str) -> list[str]:
    """Convenience wrapper: just the file list."""
    return scan_with_info(root_str)[0]


def scan_with_info(root_str: str) -> tuple[list[str], bool]:
    """Returns (files, truncated). truncated=True means MAX_FILES was hit and the
    list is incomplete – the UI shows a warning so nobody trusts a partial graph."""
    root = Path(root_str).expanduser()
    if not root.is_absolute():
        raise ScanError("Path must be absolute, e.g. /home/you/project")
    if not root.is_dir():
        raise ScanError(f"Not a directory: {root}")
    root = root.resolve()

    spec = _load_gitignore(root)
    files: list[str] = []

    # Manual stack-based walk instead of os.walk so we can prune ignored dirs
    # *before* descending into them (node_modules alone can be 100k files).
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir())
        except PermissionError:
            continue

        for entry in entries:
            if entry.is_symlink():
                continue
            rel = entry.relative_to(root).as_posix()

            if entry.is_dir():
                if entry.name in DEFAULT_IGNORED_DIRS:
                    continue
                # pathspec expects a trailing slash to match directory rules like "build/"
                if spec and spec.match_file(rel + "/"):
                    continue
                stack.append(entry)
                continue

            if language_of(rel) is None:
                continue
            if spec and spec.match_file(rel):
                continue
            if entry.stat().st_size > MAX_FILE_BYTES:
                continue
            if _is_binary(entry):
                continue

            files.append(rel)
            if len(files) >= MAX_FILES:
                return sorted(files), True

    return sorted(files), False
