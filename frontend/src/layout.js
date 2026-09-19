// React Flow draws nodes wherever you tell it – it has no idea what a "nice"
// layout is. Dagre is a layered-graph layout engine: it puts importers above the
// files they import and spaces everything so edges cross as little as possible.
import dagre from "@dagrejs/dagre";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 46;

export function layoutGraph(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 70 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  // dagre returns the CENTRE of each node; React Flow wants the top-left corner.
  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } };
  });
}
