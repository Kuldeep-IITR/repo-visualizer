import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, MarkerType,
  useNodesState, useEdgesState, useReactFlow, useNodesInitialized,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FileNode, { LANGUAGE_COLORS } from "./FileNode";
import FolderNode from "./FolderNode";
import { buildLayout } from "../layout";

// Defined outside the component so the object identity never changes (React Flow warns otherwise).
const nodeTypes = { file: FileNode, folder: FolderNode };

function toFlowEdges(graph) {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.circular,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.circular ? "#dc2626" : "#64748b" },
    style: { stroke: e.circular ? "#dc2626" : "#64748b", strokeWidth: e.circular ? 2 : 1.5 },
  }));
}

export default function GraphCanvas({ graph, selectedId, matches, onSelect }) {
  // useNodesState / useEdgesState are React Flow's own state hooks. They keep
  // dragged positions for us and give back an onChange handler to wire up.
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();     // true once every node has been measured
  const pendingFit = useRef(false);

  // New graph from the backend -> lay it out once and load it.
  useEffect(() => {
    if (!graph) return;
    setNodes(buildLayout(graph));
    setEdges(toFlowEdges(graph));
    pendingFit.current = true;
  }, [graph, setNodes, setEdges]);

  // Once the new nodes are measured, fit the whole graph into view.
  useEffect(() => {
    if (initialized && pendingFit.current) {
      pendingFit.current = false;
      fitView({ padding: 0.05, maxZoom: 1 });
    }
  }, [initialized, fitView]);

  // Search matches changed -> zoom to them.
  useEffect(() => {
    if (matches && matches.size > 0 && initialized) {
      fitView({ nodes: [...matches].map((id) => ({ id })), padding: 0.4, duration: 300, maxZoom: 1.25 });
    }
  }, [matches, initialized, fitView]);

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
    setNodes((nds) => nds.map((n) => n.type !== "file" ? n : ({
      ...n,
      selected: n.id === selectedId,
      data: { ...n.data, dimmed: keep ? !keep.has(n.id) : false },
    })));
    setEdges((eds) => eds.map((e) => {
      const touches = e.source === selectedId || e.target === selectedId;
      return { ...e, style: { ...e.style, opacity: selectedId && !touches ? 0.12 : 1 } };
    }));
  }, [selectedId, matches, graph, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => {
    if (node.type === "folder") {
      // clicking a folder box zooms to it instead of selecting it
      fitView({ nodes: [{ id: node.id }], padding: 0.15, duration: 400, maxZoom: 1.2 });
      return;
    }
    onSelect(node.id);
  }, [onSelect, fitView]);
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
      minZoom={0.02}
      maxZoom={2.5}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={4}
        nodeColor={(n) => n.type === "folder"
          ? "#cbd5e1"
          : (LANGUAGE_COLORS[n.data.language] ?? LANGUAGE_COLORS.unknown)}
      />
    </ReactFlow>
  );
}
