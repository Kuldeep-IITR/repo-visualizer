"""
Analyse a repository straight from its URL.

    https://github.com/owner/repo  ->  shallow clone into backend/repos/<host>/<owner>/<repo>
                                   ->  analysed exactly like a local folder

Only the latest commit is downloaded (--depth 1), so even big projects clone in
seconds. The clone is kept so the next analysis is instant; `refresh=True`
throws it away and clones again to pick up new commits.

Public repositories only. Git is run with terminal prompts disabled, so a
private repository fails immediately with a clear message instead of hanging
on a username prompt nobody can answer.
"""
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from .models import CloneInfo

REPOS_DIR = Path(__file__).resolve().parent.parent / "repos"
CLONE_TIMEOUT = 300          # seconds; the 1,500-file cap in the scanner handles size after that

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")   # what we allow in host / owner / repo names


class RemoteError(Exception):
    """Carries an HTTP status so main.py can map it directly."""
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def is_url(text: str) -> bool:
    return text.strip().lower().startswith(("http://", "https://"))


def parse(url: str) -> tuple[str, str, str, str, str | None]:
    """
    'https://github.com/psf/requests/tree/main/src' -> (clone_url, host, owner, repo, branch)
    Works for GitHub, GitLab (…/-/tree/branch) and Bitbucket (…/src/branch) style URLs.
    """
    u = urlparse(url.strip())
    host = u.hostname or ""
    parts = [p for p in u.path.split("/") if p]
    if u.scheme not in ("http", "https") or not host or len(parts) < 2:
        raise RemoteError("URL must look like https://github.com/owner/repository")

    owner, repo = parts[0], parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not (_SAFE.match(host) and _SAFE.match(owner) and _SAFE.match(repo)):
        raise RemoteError("Unexpected characters in the repository URL")

    branch = None
    rest = parts[2:]
    if rest and rest[0] == "-":          # gitlab: /owner/repo/-/tree/branch
        rest = rest[1:]
    if len(rest) >= 2 and rest[0] in ("tree", "blob", "src"):
        branch = rest[1]
        if not _SAFE.match(branch):
            raise RemoteError("Unexpected characters in the branch name")

    clone_url = f"{u.scheme}://{host}/{owner}/{repo}.git"
    return clone_url, host, owner, repo, branch


def clone(url: str, refresh: bool = False) -> tuple[Path, str]:
    """Returns (local_path, short_commit_hash). Reuses an existing clone unless refresh=True."""
    if shutil.which("git") is None:
        raise RemoteError("git is not installed on this machine, so URLs cannot be analysed.", 500)

    clone_url, host, owner, repo, branch = parse(url)
    dest = REPOS_DIR / host / owner / (f"{repo}@{branch}" if branch else repo)

    if refresh and dest.exists():
        shutil.rmtree(dest)

    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        cmd = ["git", "clone", "--depth", "1", "--single-branch"]
        if branch:
            cmd += ["--branch", branch]
        cmd += [clone_url, str(dest)]
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CLONE_TIMEOUT, env=env)
        except subprocess.TimeoutExpired:
            shutil.rmtree(dest, ignore_errors=True)
            raise RemoteError(f"Cloning took longer than {CLONE_TIMEOUT} seconds and was cancelled. "
                              "Try a smaller repository or a sub-folder of a local clone.", 504)
        if proc.returncode != 0:
            shutil.rmtree(dest, ignore_errors=True)
            message, status = _explain(proc.stderr, branch)
            raise RemoteError(message, status)

    head = subprocess.run(["git", "-C", str(dest), "rev-parse", "--short", "HEAD"],
                          capture_output=True, text=True)
    return dest, head.stdout.strip() or "unknown"


def _explain(stderr: str, branch: str | None) -> tuple[str, int]:
    """Turn git's stderr into (one sentence a person can act on, HTTP status)."""
    low = stderr.lower()
    if branch and "remote branch" in low and "not found" in low:
        return f"Branch '{branch}' does not exist in that repository.", 404
    # With prompts disabled, git reports a missing OR private repo as "could not read Username".
    if "not found" in low or "could not read username" in low or "authentication failed" in low:
        return "Repository not found, or it is private. Only public repositories can be analysed by URL.", 404
    if "could not resolve host" in low:
        return "Could not reach the Git host. Check your internet connection.", 502
    last = stderr.strip().splitlines()[-1] if stderr.strip() else "unknown error"
    return f"git clone failed: {last}", 502


# ---------------------------------------------------------------- managing the cache
# A clone id is its path relative to REPOS_DIR: "github.com/psf/requests" or
# "github.com/psf/requests@main". Three segments, nothing else, so it can never
# point outside the cache folder.
_ID = re.compile(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(@[A-Za-z0-9._-]+)?$")


def clone_id_for(path: Path) -> str | None:
    """Reverse of the dest calculation in clone(); None if the path is not a cached clone."""
    try:
        rel = path.resolve().relative_to(REPOS_DIR.resolve()).as_posix()
    except ValueError:
        return None
    return rel if _ID.match(rel) else None


def _dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _info(path: Path) -> CloneInfo:
    host, owner, last = path.relative_to(REPOS_DIR).parts
    repo, _, branch = last.partition("@")
    head = subprocess.run(["git", "-C", str(path), "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return CloneInfo(
        id=f"{host}/{owner}/{last}",
        url=f"https://{host}/{owner}/{repo}" + (f"/tree/{branch}" if branch else ""),
        path=str(path),
        commit=head.stdout.strip() or "unknown",
        size_bytes=_dir_size(path),
        cloned_at=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
    )


def list_clones() -> list[CloneInfo]:
    if not REPOS_DIR.is_dir():
        return []
    out = []
    for host in sorted(REPOS_DIR.iterdir()):
        for owner in sorted(p for p in host.iterdir() if p.is_dir()) if host.is_dir() else []:
            for repo in sorted(p for p in owner.iterdir() if p.is_dir()):
                if (repo / ".git").exists():
                    out.append(_info(repo))
    return out


def remove_clone(clone_id: str) -> int:
    """Delete one cached clone. Returns bytes freed. Raises RemoteError(404) if unknown."""
    if not _ID.match(clone_id):
        raise RemoteError("Not a valid clone id", 400)
    path = (REPOS_DIR / clone_id).resolve()
    if REPOS_DIR.resolve() not in path.parents or not (path / ".git").exists():
        raise RemoteError("No such downloaded repository", 404)
    freed = _dir_size(path)
    shutil.rmtree(path)
    # tidy empty host/owner folders left behind
    for parent in (path.parent, path.parent.parent):
        if parent != REPOS_DIR and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
    return freed


def remove_all_clones() -> tuple[list[str], int]:
    removed, freed = [], 0
    for info in list_clones():
        freed += remove_clone(info.id)
        removed.append(info.id)
    return removed, freed
