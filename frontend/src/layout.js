// Layout strategy
// ---------------
// 1. Files are grouped by folder. Each folder becomes a React Flow "parent" node
//    (a labelled box) and its files are positioned INSIDE it.
// 2. Inside a folder: files that import each other are laid out with dagre
//    (importers above imports). Files with no imports at all are packed into a
//    compact grid underneath, instead of dagre's one-endless-row default.
// 3. The folders themselves are laid out the same way: folders that import each
//    other go through dagre, unrelated folders are packed into a grid.
//
// Result: a repo with 40 unrelated scripts becomes a tidy block, not a 40-wide line.
import dagre from "@dagrejs/dagre";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 46;
const FILE_GAP = 24;       // between files inside a folder
const FOLDER_GAP = 90;     // between folders
const PAD = 18;            // folder box padding (left/right/bottom)
const PAD_TOP = 44;        // room for the folder label

export function folderOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
export const groupId = (dir) => `folder:${dir}`;

// ---- shelf packing: fill rows left-to-right up to maxWidth ----------------
function packShelf(items, maxWidth, gap) {
  const pos = {};
  let x = 0, y = 0, rowH = 0, width = 0;
  items.forEach((it) => {
    if (x > 0 && x + it.width > maxWidth) {       // wrap to next row
      y += rowH + gap; x = 0; rowH = 0;
    }
    pos[it.id] = { x, y };
    x += it.width + gap;
    rowH = Math.max(rowH, it.height);
    width = Math.max(width, x - gap);
  });
  return { pos, width, height: y + rowH };
}

// ---- dagre for connected items + grid for isolated ones -------------------
function layoutCluster(items, edges, gap) {
  const ids = new Set(items.map((i) => i.id));
  const inner = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const connectedIds = new Set(inner.flatMap((e) => [e.source, e.target]));
  const connected = items.filter((i) => connectedIds.has(i.id));
  const isolated = items.filter((i) => !connectedIds.has(i.id));

  const pos = {};
  let width = 0, height = 0;

  if (connected.length) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: gap, ranksep: gap * 1.6, marginx: 0, marginy: 0 });
    connected.forEach((i) => g.setNode(i.id, { width: i.width, height: i.height }));
    inner.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    connected.forEach((i) => {
      const n = g.node(i.id);
      const x = n.x - i.width / 2, y = n.y - i.height / 2;   // dagre gives centres
      pos[i.id] = { x, y };
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + i.width); maxY = Math.max(maxY, y + i.height);
    });
    connected.forEach((i) => { pos[i.id].x -= minX; pos[i.id].y -= minY; });
    width = maxX - minX; height = maxY - minY;
  }

  if (isolated.length) {
    // aim for a roughly 16:10 block: width ≈ sqrt(total area * 1.6)
    const area = isolated.reduce((s, i) => s + (i.width + gap) * (i.height + gap), 0);
    const maxItemW = Math.max(...isolated.map((i) => i.width));
    const target = Math.max(width, maxItemW, Math.sqrt(area * 1.6));
    const packed = packShelf(isolated, target, gap);
    const offsetY = height ? height + gap * 1.6 : 0;
    isolated.forEach((i) => { pos[i.id] = { x: packed.pos[i.id].x, y: packed.pos[i.id].y + offsetY }; });
    width = Math.max(width, packed.width);
    height = offsetY + packed.height;
  }
  return { pos, width, height };
}

// ---- public: backend graph -> React Flow nodes with positions -------------
export function buildLayout(graph) {
  // 1. bucket files by folder
  const byFolder = new Map();
  graph.nodes.forEach((n) => {
    const dir = folderOf(n.path);
    if (!byFolder.has(dir)) byFolder.set(dir, []);
    byFolder.get(dir).push(n);
  });

  // 2. lay out each folder's files
  const folders = [];
  const filePos = {};
  byFolder.forEach((files, dir) => {
    const items = files.map((f) => ({ id: f.id, width: NODE_WIDTH, height: NODE_HEIGHT }));
    const { pos, width, height } = layoutCluster(items, graph.edges, FILE_GAP);
    Object.assign(filePos, pos);
    const langs = {};
    files.forEach((f) => { langs[f.language] = (langs[f.language] || 0) + 1; });
    // make the box at least wide enough to show its label (≈8.5px per monospace char)
    const labelWidth = Math.min((dir || "(root)").length * 8.5 + 70, 520);
    folders.push({
      id: groupId(dir), dir, count: files.length,
      width: Math.max(width + PAD * 2, labelWidth), height: height + PAD_TOP + PAD,
      language: Object.entries(langs).sort((a, b) => b[1] - a[1])[0][0],   // dominant language
    });
  });

  // 3. lay out the folders using folder-to-folder import edges
  const folderEdges = graph.edges
    .map((e) => ({ source: groupId(folderOf(e.source)), target: groupId(folderOf(e.target)) }))
    .filter((e) => e.source !== e.target);
  const folderLayout = layoutCluster(folders, folderEdges, FOLDER_GAP);

  // 4. emit React Flow nodes: parents FIRST (React Flow requires it), then children
  const folderNodes = folders.map((f) => ({
    id: f.id,
    type: "folder",
    position: folderLayout.pos[f.id],
    style: { width: f.width, height: f.height },
    data: { label: f.dir || "(root)", count: f.count, language: f.language },
    selectable: false,
  }));

  const fileNodes = graph.nodes.map((n) => ({
    id: n.id,
    type: "file",
    parentId: groupId(folderOf(n.path)),
    extent: "parent",
    position: { x: filePos[n.id].x + PAD, y: filePos[n.id].y + PAD_TOP },   // relative to the folder box
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: { ...n, dimmed: false },
  }));

  return [...folderNodes, ...fileNodes];
}
