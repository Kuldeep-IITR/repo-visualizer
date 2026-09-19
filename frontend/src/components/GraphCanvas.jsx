import { useCallback, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, MarkerType,
  useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FileNode, { LANGUAGE_COLORS } from "./FileNode";
import { layoutGraph } from "./../layout";

// Tell React Flow that type "file" means "render with FileNode".
// Defined outside the component so the object identity never changes (React Flow warns otherwise).
const nodeTypes = { file: FileNode };

// Convert backend JSON -> React Flow node/edge objects.
function toFlowNodes(graph) {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: "file",
    data: { ...n, dimmed: false },
    position: { x: 0, y: 0 },       // dagre overwrites this
  }));
}

function toFlowEdges(graph) {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.circular,
    className: e.circular ? "edge-circular" : "",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.circular ? "#dc2626" : "#94a3b8" },
    style: { stroke: e.circular ? "#dc2626" : "#94a3b8", strokeWidth: e.circular ? 2 : 1.5 },
  }));
}

export default function GraphCanvas({ graph, selectedId, matches, onSelect }) {
  // useNodesState / useEdgesState are React Flow's own state hooks. They keep
  // dragged positions for us and give back an onChange handler to wire up.
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // New graph from the backend -> lay it out once and load it.
  useEffect(() => {
    if (!graph) return;
    const flowEdges = toFlowEdges(graph);
    setNodes(layoutGraph(toFlowNodes(graph), flowEdges));
    setEdges(flowEdges);
  }, [graph, setNodes, setEdges]);

  // Selection or search changed -> dim everything that is not relevant.
  //   selection: keep the node + its direct neighbours
  //   search   : keep the matching nodes
  // We map over the EXISTING nodes (not rebuild them) so dragged positions survive.
  useEffect(() => {
    if (!graph) return;
    let keep = null;                        // null = nothing dimmed
    if (selectedId) {
      keep = new Set([selectedId]);
      graph.edges.forEach((e) => {
        if (e.source === selectedId) keep.add(e.target);
        if (e.target === selectedId) keep.add(e.source);
      });
    } else if (matches) {
      keep = matches;
    }
    setNodes((nds) => nds.map((n) => ({
      ...n,
      selected: n.id === selectedId,
      data: { ...n.data, dimmed: keep ? !keep.has(n.id) : false },
    })));
    setEdges((eds) => eds.map((e) => {
      const touches = e.source === selectedId || e.target === selectedId;
      return {
        ...e,
        style: { ...e.style, opacity: selectedId && !touches ? 0.15 : 1 },
        zIndex: touches ? 1 : 0,
      };
    }));
  }, [selectedId, matches, graph, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => onSelect(node.id), [onSelect]);
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      minZoom={0.05}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => LANGUAGE_COLORS[n.data.language] ?? LANGUAGE_COLORS.unknown}
      />
    </ReactFlow>
  );
}
