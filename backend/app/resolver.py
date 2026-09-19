"""
Step 3 of the pipeline: map an ImportRef to a file inside the repo.

resolve(...) returns either
    ("file", "src/app/graph.py")   -> becomes an edge in the graph
    ("external", "fastapi")        -> listed on the node, no edge
    ("skip", "")                   -> css/json/etc. we don't care about

Every language has its own lookup rules, but the idea is the same: build a few
candidate paths and return the first one that exists in `files` (the set the
scanner produced). We never touch the disk here – just set lookups, so it's fast.
"""
from pathlib import PurePosixPath

from .parsers import ImportRef

_JS_EXTS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]
_NON_CODE_EXTS = {".css", ".scss", ".sass", ".less", ".json", ".svg", ".png", ".jpg", ".gif", ".ico", ".woff", ".woff2"}


def _norm(p: PurePosixPath) -> str:
    """Collapse '..' and '.' segments, since PurePosixPath doesn't."""
    parts: list[str] = []
    for part in p.parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part not in (".", ""):
            parts.append(part)
    return "/".join(parts)


def _first_existing(candidates: list[str], files: set[str]) -> str | None:
    for c in candidates:
        if c in files:
            return c
    return None


# ---------------------------------------------------------------- Python
def _python_roots(importer: str) -> list[PurePosixPath]:
    """
    Absolute imports are resolved from a "root" on sys.path. We don't know what
    that is, so we try: the importer's own dir, every parent up to the repo root.
    This covers `python -m pkg.mod`, running from src/, and plain scripts.
    """
    roots = []
    d = PurePosixPath(importer).parent
    while True:
        roots.append(d)
        if d == PurePosixPath("."):
            break
        d = d.parent
    return roots


def _resolve_python(ref: ImportRef, importer: str, files: set[str], root_name: str) -> tuple[str, str]:
    if ref.level > 0:
        # relative: `from .x import y` -> start at importer's dir, go up (level-1)
        base = PurePosixPath(importer).parent
        for _ in range(ref.level - 1):
            base = base.parent
        roots = [base]
    else:
        roots = _python_roots(importer)

    mod_parts = ref.target.split(".") if ref.target else []
    # If the scanned folder IS the package (user pointed us at ~/code/myapp and the
    # code says `from myapp.x import y`), the first segment names the root itself.
    if mod_parts and mod_parts[0] == root_name:
        mod_parts = mod_parts[1:] or mod_parts
    candidates: list[str] = []
    for root in roots:
        pkg = root.joinpath(*mod_parts) if mod_parts else root
        # `from pkg import mod` – the imported name may itself be a module.
        # Try that first: it's more precise than pointing at pkg/__init__.py.
        for name in ref.names:
            candidates.append(_norm(pkg / f"{name}.py"))
            candidates.append(_norm(pkg / name / "__init__.py"))
        if mod_parts:
            candidates.append(_norm(pkg.with_suffix(".py")))
            candidates.append(_norm(pkg / "__init__.py"))

    hit = _first_existing(candidates, files)
    if hit:
        return "file", hit
    # external: report the top-level package only ("os.path" -> "os")
    return "external", (mod_parts[0] if mod_parts else ".")


# ---------------------------------------------------------------- JS / TS
def _js_candidates(base: PurePosixPath) -> list[str]:
    out = [_norm(base)]
    out += [_norm(base.with_name(base.name + ext)) for ext in _JS_EXTS]
    out += [_norm(base / ("index" + ext)) for ext in _JS_EXTS]
    # TS projects write `import './x.js'` while the file on disk is x.ts
    if base.suffix in (".js", ".jsx", ".mjs"):
        stem = base.with_suffix("")
        out += [_norm(stem.with_name(stem.name + ext)) for ext in (".ts", ".tsx")]
    return out


def _resolve_js(ref: ImportRef, importer: str, files: set[str], root_name: str) -> tuple[str, str]:
    target = ref.target
    if PurePosixPath(target).suffix.lower() in _NON_CODE_EXTS:
        return "skip", ""

    if target.startswith("."):
        base = PurePosixPath(importer).parent / target
        hit = _first_existing(_js_candidates(base), files)
        return ("file", hit) if hit else ("external", target)

    if target.startswith("/"):
        hit = _first_existing(_js_candidates(PurePosixPath(target.lstrip("/"))), files)
        return ("file", hit) if hit else ("external", target)

    # Common alias: "@/components/x" -> src/components/x
    if target.startswith("@/"):
        hit = _first_existing(_js_candidates(PurePosixPath("src") / target[2:]), files)
        if hit:
            return "file", hit

    # bare specifier = npm package; keep only the package name ("react-dom/client" -> "react-dom")
    parts = target.split("/")
    pkg = "/".join(parts[:2]) if target.startswith("@") else parts[0]
    return "external", pkg


# ---------------------------------------------------------------- C / C++
def _resolve_c(ref: ImportRef, importer: str, files: set[str], root_name: str) -> tuple[str, str]:
    if ref.system:
        return "external", ref.target
    # 1) relative to the including file
    same_dir = _norm(PurePosixPath(importer).parent / ref.target)
    if same_dir in files:
        return "file", same_dir
    # 2) relative to repo root, or common include dirs
    for prefix in ("", "include/", "src/", "inc/"):
        cand = _norm(PurePosixPath(prefix + ref.target))
        if cand in files:
            return "file", cand
    # 3) anywhere in the repo whose path ends with the include string
    suffix = "/" + ref.target
    for f in files:
        if f.endswith(suffix):
            return "file", f
    return "external", ref.target


# ---------------------------------------------------------------- dispatcher
_RESOLVERS = {
    "python": _resolve_python,
    "javascript": _resolve_js,
    "typescript": _resolve_js,
    "c": _resolve_c,
    "cpp": _resolve_c,
}


def resolve(language: str, ref: ImportRef, importer: str, files: set[str], root_name: str = "") -> tuple[str, str]:
    """root_name = basename of the scanned folder, e.g. "fastapi" for /x/y/fastapi."""
    fn = _RESOLVERS.get(language)
    return fn(ref, importer, files, root_name) if fn else ("skip", "")
