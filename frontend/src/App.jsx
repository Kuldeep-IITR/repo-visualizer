import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { analyzeRepo, getHealth, getSuggestions } from "./api";
import RepoInput from "./components/RepoInput";
import GraphCanvas from "./components/GraphCanvas";
import SidePanel from "./components/SidePanel";
import FolderList from "./components/FolderList";
import Welcome from "./components/Welcome";
import FolderPicker from "./components/FolderPicker";
import HelpModal from "./components/HelpModal";

// localStorage keys – remembered per browser so you don't retype paths.
const LS_LAST = "repo-visualizer:last-path";
const LS_RECENTS = "repo-visualizer:recents";
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

export default function App() {
  const [path, setPath] = useState(() => localStorage.getItem(LS_LAST) ?? "");
  const [graph, setGraph] = useState(null);       // the JSON from /api/analyze
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendUp, setBackendUp] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [recents, setRecents] = useState(() => readJSON(LS_RECENTS, []));
  const [showPicker, setShowPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef(null);
  const { fitView } = useReactFlow();

  // On load: is the backend there? What are good starting folders?
  useEffect(() => {
    getHealth().then(() => setBackendUp(true)).catch(() => setBackendUp(false));
    getSuggestions().then(setSuggestions).catch(() => {});
  }, []);

  // Keyboard shortcuts. Ignored while typing in an input.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if (showPicker || showHelp) return;                 // dialogs handle their own Esc
      if (e.key === "Escape") { setSelectedId(null); document.activeElement?.blur(); }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "?") setShowHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPicker, showHelp]);

  async function handleAnalyze(p) {
    const target = p.trim();
    if (!target) return;
    setPath(target);
    setShowPicker(false);
    setLoading(true);
    setError("");
    setSelectedId(null);
    setSearch("");
    try {
      const g = await analyzeRepo(target);
      setGraph(g);
      setBackendUp(true);
      localStorage.setItem(LS_LAST, target);
      const next = [target, ...recents.filter((r) => r !== target)].slice(0, 6);
      setRecents(next);
      localStorage.setItem(LS_RECENTS, JSON.stringify(next));
    } catch (e) {
      setError(e.message);
      if (e.message.startsWith("Cannot reach")) setBackendUp(false);
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
        <h1 title="Repo Visualizer">Repo Visualizer</h1>
        <RepoInput value={path} onChange={setPath} onSubmit={handleAnalyze} onBrowse={() => setShowPicker(true)} loading={loading} />
        {graph && (
          <div className="search-wrap">
            <input
              ref={searchRef}
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…  ( / )"
              title="Type part of a file name or path. Press / to focus."
            />
            {search && <button className="icon-btn search-clear" onClick={() => setSearch("")} title="Clear">×</button>}
          </div>
        )}
        {stats && (
          <div className="stats">
            <span title="Source files found (after ignore rules)"><b>{stats.files}</b> files</span>
            <span title="Import relationships between files in this repository"><b>{stats.edges}</b> imports</span>
            <span title="Lines of code, excluding blank lines and comments"><b>{stats.total_loc.toLocaleString()}</b> loc</span>
            <span className={stats.cycles ? "warn" : ""} title="Groups of files that import each other in a loop"><b>{stats.cycles}</b> cycles</span>
            {matches && <span><b>{matches.size}</b> {matches.size === 1 ? "match" : "matches"}</span>}
          </div>
        )}
        <button className="icon-btn help-btn" onClick={() => setShowHelp(true)} title="How to read the map (?)">?</button>
      </header>

      {!backendUp && (
        <div className="banner banner-error">
          <b>Backend not reachable.</b> Open a terminal in the project folder and run <code>./run.sh</code>, then reload this page.
        </div>
      )}
      {error && backendUp && <div className="banner banner-error">{error}</div>}
      {stats?.truncated && (
        <div className="banner banner-warn">
          <b>Partial map.</b> This folder has more than {stats.max_files.toLocaleString()} source files, so only the first
          {" "}{stats.max_files.toLocaleString()} are shown. Analyse a sub-folder for a complete picture.
        </div>
      )}

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
            <Welcome
              suggestions={suggestions}
              recents={recents}
              onPick={handleAnalyze}
              onBrowse={() => setShowPicker(true)}
              loading={loading}
            />
          )}
          {matches && matches.size === 0 && (
            <div className="canvas-note">No file matches “{search}”.</div>
          )}
          {loading && (
            <div className="loading">
              <div className="spinner" />
              <div>Scanning files and resolving imports…</div>
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

      {showPicker && (
        <FolderPicker
          initialPath={path.trim() || null}
          onPick={handleAnalyze}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
