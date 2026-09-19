"""
Step 5 of the pipeline: glue everything into one GraphResponse.

    scan -> (per file) read, parse, resolve, metrics -> nodes + edges -> mark cycles

Cycle detection uses Kosaraju's algorithm to find strongly connected components
(SCCs). An SCC is a group of files where every file can reach every other one by
following imports. Any SCC with more than one file IS an import cycle, and every
edge that stays inside that SCC is part of it – those get `circular=True`.
"""
from collections import Counter, defaultdict
from pathlib import Path

from .metrics import compute
from .models import Edge, GraphResponse, Loc, Node, Stats
from .parsers import extract_imports
from .resolver import resolve
from .scanner import MAX_FILES, language_of, scan_with_info


def _read(path: Path) -> str:
    # errors="replace" -> a weird byte becomes U+FFFD instead of crashing the scan
    return path.read_text(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- cycles
def _find_cycles(nodes: list[str], adj: dict[str, set[str]]) -> tuple[set[str], set[tuple[str, str]]]:
    """
    Kosaraju, iterative (recursion would overflow on deep graphs).
    Returns (set of node ids in cycles, set of (src, dst) edges in cycles).
    """
    # pass 1: DFS on the normal graph, record nodes in order of finishing
    finished: list[str] = []
    seen: set[str] = set()
    for start in nodes:
        if start in seen:
            continue
        stack = [(start, iter(adj[start]))]
        seen.add(start)
        while stack:
            node, children = stack[-1]
            for child in children:
                if child not in seen:
                    seen.add(child)
                    stack.append((child, iter(adj[child])))
                    break
            else:
                finished.append(node)
                stack.pop()

    # pass 2: DFS on the REVERSED graph in reverse finishing order; each tree = one SCC
    radj: dict[str, set[str]] = defaultdict(set)
    for src, dsts in adj.items():
        for dst in dsts:
            radj[dst].add(src)

    comp_of: dict[str, int] = {}
    for start in reversed(finished):
        if start in comp_of:
            continue
        comp_id = len(comp_of)
        stack = [start]
        comp_of[start] = comp_id
        while stack:
            node = stack.pop()
            for prev in radj[node]:
                if prev not in comp_of:
                    comp_of[prev] = comp_id
                    stack.append(prev)

    sizes = Counter(comp_of.values())
    cyclic_nodes = {n for n, c in comp_of.items() if sizes[c] > 1}
    # a file importing itself is a 1-node cycle
    cyclic_nodes |= {n for n in nodes if n in adj[n]}
    cyclic_edges = {(s, d) for s, dsts in adj.items() for d in dsts
                    if s == d or (s in cyclic_nodes and comp_of[s] == comp_of[d])}
    return cyclic_nodes, cyclic_edges


# ---------------------------------------------------------------- build
def build(root_str: str) -> GraphResponse:
    files, truncated = scan_with_info(root_str)  # validates the path (raises ScanError)
    root = Path(root_str).expanduser().resolve()
    fset = set(files)

    nodes: list[Node] = []
    adj: dict[str, set[str]] = defaultdict(set)   # importer -> set of imported files
    languages: Counter = Counter()
    total_loc = 0

    for rel in files:
        lang = language_of(rel) or "unknown"
        text = _read(root / rel)
        loc, complexity, bloated = compute(lang, text)
        externals: set[str] = set()

        for ref in extract_imports(lang, text):
            kind, value = resolve(lang, ref, rel, fset, root.name)
            if kind == "file" and value != rel:      # ignore self-import noise
                adj[rel].add(value)
            elif kind == "external":
                externals.add(value)

        nodes.append(Node(
            id=rel, label=Path(rel).name, path=rel, language=lang,
            loc=Loc(**loc.__dict__), complexity=complexity, bloated=bloated,
            external_imports=sorted(externals),
        ))
        languages[lang] += 1
        total_loc += loc.code

    cyclic_nodes, cyclic_edges = _find_cycles(files, adj)

    edges = [
        Edge(id=f"{src}->{dst}", source=src, target=dst, circular=(src, dst) in cyclic_edges)
        for src in files for dst in sorted(adj[src])
    ]

    # count distinct cycles = number of SCCs with >1 node
    cycle_groups = _count_components(cyclic_nodes, adj)

    return GraphResponse(
        root=str(root),
        stats=Stats(files=len(nodes), edges=len(edges), total_loc=total_loc,
                    cycles=cycle_groups, languages=dict(languages),
                    truncated=truncated, max_files=MAX_FILES),
        nodes=nodes,
        edges=edges,
    )


def _count_components(cyclic_nodes: set[str], adj: dict[str, set[str]]) -> int:
    """How many separate cycle groups exist (undirected flood-fill over cyclic nodes)."""
    seen: set[str] = set()
    groups = 0
    for start in cyclic_nodes:
        if start in seen:
            continue
        groups += 1
        stack = [start]
        seen.add(start)
        while stack:
            n = stack.pop()
            neighbours = {d for d in adj[n] if d in cyclic_nodes}
            neighbours |= {s for s, dsts in adj.items() if n in dsts and s in cyclic_nodes}
            for m in neighbours:
                if m not in seen:
                    seen.add(m)
                    stack.append(m)
    return groups
