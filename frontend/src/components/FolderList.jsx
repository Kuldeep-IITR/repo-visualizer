import { useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { folderOf, groupId } from "../layout";
import { LANGUAGE_COLORS } from "./FileNode";

// Left sidebar: one row per folder. Clicking zooms the canvas to that folder.
export default function FolderList({ graph, hideIsolated, onToggleIsolated, isolatedCount, languages }) {
  const { fitView } = useReactFlow();

  const folders = useMemo(() => {
    const m = new Map();
    graph.nodes.forEach((n) => {
      const dir = folderOf(n.path);
      m.set(dir, (m.get(dir) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph]);

  function focus(dir) {
    fitView({ nodes: [{ id: groupId(dir) }], padding: 0.15, duration: 400, maxZoom: 1.2 });
  }

  return (
    <aside className="folders">
      <div className="folders-head">
        <span>Folders <span className="muted small">({folders.length})</span></span>
        <label className="small" title="Files that neither import nor are imported by anything">
          <input type="checkbox" checked={hideIsolated} onChange={onToggleIsolated} />
          hide isolated ({isolatedCount})
        </label>
      </div>
      <ul>
        {folders.map(([dir, count]) => (
          <li key={dir}>
            <button className="folder-row" onClick={() => focus(dir)} title={dir || "(root)"}>
              <span className="folder-row-name">{dir || "(root)"}</span>
              <span className="folder-row-count">{count}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="legend">
        {Object.entries(languages).map(([lang, count]) => (
          <span key={lang}>
            <i style={{ background: LANGUAGE_COLORS[lang] ?? LANGUAGE_COLORS.unknown }} />
            {lang} ({count})
          </span>
        ))}
        <span><i className="legend-bloated" />bloated</span>
        <span><i className="legend-cycle" />cycle</span>
      </div>
    </aside>
  );
}
