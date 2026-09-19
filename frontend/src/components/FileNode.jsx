import { Handle, Position } from "@xyflow/react";

// One colour per language; used by the node, the minimap and the legend.
export const LANGUAGE_COLORS = {
  python: "#3b82f6",
  javascript: "#eab308",
  typescript: "#2563eb",
  c: "#6b7280",
  cpp: "#0e7490",
  unknown: "#9ca3af",
};

// A "custom node" is just a React component. React Flow passes the node's
// `data` object (whatever we put there) and handles dragging/positioning itself.
export default function FileNode({ data, selected }) {
  const color = LANGUAGE_COLORS[data.language] ?? LANGUAGE_COLORS.unknown;
  const classes = [
    "file-node",
    data.bloated ? "bloated" : "",
    data.dimmed ? "dimmed" : "",
    selected ? "selected" : "",
  ].join(" ");

  return (
    <div className={classes} style={{ borderLeftColor: color }} title={data.path}>
      {/* Handles are the attachment points for edges: incoming on top, outgoing below. */}
      <Handle type="target" position={Position.Top} />
      <div className="file-node-label">{data.label}</div>
      <div className="file-node-meta">
        <span className="chip" style={{ background: color }}>{data.language}</span>
        <span className="loc">{data.loc.code} loc</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
