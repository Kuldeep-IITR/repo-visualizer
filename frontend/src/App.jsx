import { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { analyzeRepo } from "./api";
import RepoInput from "./components/RepoInput";
import GraphCanvas from "./components/GraphCanvas";
import SidePanel from "./components/SidePanel";
import FolderList from "./components/FolderList";
import { LANGUAGE_COLORS } from "./components/FileNode";

export default function App() {
  const [graph, setGraph] = useState(null);       // the JSON from /api/analyze
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { fitView } = useReactFlow();

  async function handleAnalyze(path) {
    setLoading(true);
    setError("");
    setSelectedId(null);
    setSearch("");
    try {
      setGraph(await analyzeRepo(path));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Files that neither import nor are imported by anything.
  const isolatedIds = useMemo(() => {
    if (!graph) return new Set();
    const connected = new Set(graph.edges.flatMap((e) => [e.source, e.target]));
    return new Set(graph.nodes.filter((n) => !connected.has(n.id)).map((n) => n.id));
  }, [graph]);

  // What the canvas actually shows (edges never touch isolated files, so they all stay).
  const visibleGraph = useMemo(() => {
    if (!graph || !hideIsolated) return graph;
    return { ...graph, nodes: graph.nodes.filter((n) => !isolatedIds.has(n.id)) };
  }, [graph, hideIsolated, isolatedIds]);

  // useCallback keeps the same function identity between renders, so the
  // canvas's effects don't re-run just because App re-rendered.
  const handleSelect = useCallback((id) => setSelectedId(id), []);

  // Select AND zoom to a file – used by links in the side panel.
  const focusNode = useCallback((id) => {
    setSelectedId(id);
    fitView({ nodes: [{ id }], padding: 0.6, duration: 400, maxZoom: 1.4 });
  }, [fitView]);

  // Node ids whose path contains the search text (case-insensitive).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !visibleGraph) return null;                // null = no filter active
    return new Set(visibleGraph.nodes.filter((n) => n.path.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, visibleGraph]);

  const selectedNode = graph?.nodes.find((n) => n.id === selectedId) ?? null;
  const stats = graph?.stats;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Repo Visualizer</h1>
        <RepoInput onAnalyze={handleAnalyze} loading={loading} />
        {graph && (
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
          />
        )}
        {stats && (
          <div className="stats">
            <span><b>{stats.files}</b> files</span>
            <span><b>{stats.edges}</b> imports</span>
            <span><b>{stats.total_loc.toLocaleString()}</b> loc</span>
            <span className={stats.cycles ? "warn" : ""}><b>{stats.cycles}</b> cycles</span>
            {matches && <span><b>{matches.size}</b> matches</span>}
          </div>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      <div className="body">
        {graph && (
          <FolderList
            graph={visibleGraph}
            hideIsolated={hideIsolated}
            isolatedCount={isolatedIds.size}
            onToggleIsolated={() => { setHideIsolated((v) => !v); setSelectedId(null); }}
            languages={stats.languages}
          />
        )}

        <main className="canvas">
          {graph ? (
            <GraphCanvas graph={visibleGraph} selectedId={selectedId} matches={matches} onSelect={handleSelect} />
          ) : (
            <div className="empty">
              {loading ? "Scanning…" : "Enter the absolute path of a local repository to map its imports."}
            </div>
          )}
        </main>

        {/* key= forces a fresh panel per node so its local state (AI result, preview) resets */}
        {selectedNode && (
          <SidePanel
            key={selectedNode.id}
            graph={graph}
            node={selectedNode}
            onSelect={focusNode}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
