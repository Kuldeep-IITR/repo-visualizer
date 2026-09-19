import { useCallback, useMemo, useState } from "react";
import { analyzeRepo } from "./api";
import RepoInput from "./components/RepoInput";
import GraphCanvas from "./components/GraphCanvas";
import SidePanel from "./components/SidePanel";
import { LANGUAGE_COLORS } from "./components/FileNode";

export default function App() {
  const [graph, setGraph] = useState(null);       // the JSON from /api/analyze
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  // useCallback keeps the same function identity between renders, so the
  // canvas's effects don't re-run just because App re-rendered.
  const handleSelect = useCallback((id) => setSelectedId(id), []);

  // Node ids whose path contains the search text (case-insensitive).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !graph) return null;                // null = no filter active
    return new Set(graph.nodes.filter((n) => n.path.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, graph]);

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
        <main className="canvas">
          {graph ? (
            <GraphCanvas graph={graph} selectedId={selectedId} matches={matches} onSelect={handleSelect} />
          ) : (
            <div className="empty">
              {loading ? "Scanning…" : "Enter the absolute path of a local repository to map its imports."}
            </div>
          )}
          {graph && (
            <div className="legend">
              {Object.entries(stats.languages).map(([lang, count]) => (
                <span key={lang}>
                  <i style={{ background: LANGUAGE_COLORS[lang] ?? LANGUAGE_COLORS.unknown }} />
                  {lang} ({count})
                </span>
              ))}
              <span><i className="legend-bloated" />bloated</span>
              <span><i className="legend-cycle" />cycle</span>
            </div>
          )}
        </main>

        {/* key= forces a fresh panel per node so its local state (AI result, preview) resets */}
        {selectedNode && (
          <SidePanel
            key={selectedNode.id}
            graph={graph}
            node={selectedNode}
            onSelect={handleSelect}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
