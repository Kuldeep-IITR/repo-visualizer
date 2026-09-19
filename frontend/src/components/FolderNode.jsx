import { LANGUAGE_COLORS } from "./FileNode";

// The labelled box that files sit inside. React Flow sizes the wrapper from
// node.style; we just fill it and draw the label.
export default function FolderNode({ data }) {
  const color = LANGUAGE_COLORS[data.language] ?? LANGUAGE_COLORS.unknown;
  return (
    <div className="folder-node" style={{ borderColor: color, background: `${color}14` }}>
      <div className="folder-label" style={{ color }}>
        <span className="folder-name">{data.label}</span>
        <span className="folder-count">{data.count}</span>
      </div>
    </div>
  );
}
