import { useEffect, useMemo, useState } from "react";
import { getFile, summarizeFile } from "../api";
import { LANGUAGE_COLORS } from "./FileNode";

export default function SidePanel({ graph, node, onSelect, onClose }) {
  const [file, setFile] = useState(null);         // { content, truncated }
  const [ai, setAi] = useState({ status: "idle" }); // idle | loading | done | error

  // Who does this file import, and who imports it? Derived from the edge list.
  const { imports, importedBy } = useMemo(() => {
    const imports = [], importedBy = [];
    graph.edges.forEach((e) => {
      if (e.source === node.id) imports.push(e.target);
      if (e.target === node.id) importedBy.push(e.source);
    });
    return { imports: imports.sort(), importedBy: importedBy.sort() };
  }, [graph, node.id]);

  // Load the code preview whenever a different node is shown.
  useEffect(() => {
    let cancelled = false;                 // ignore the response if the user clicked elsewhere meanwhile
    setFile(null);
    setAi({ status: "idle" });
    getFile(node.id)
      .then((f) => { if (!cancelled) setFile(f); })
      .catch((e) => { if (!cancelled) setFile({ content: `Could not load file: ${e.message}`, truncated: false }); });
    return () => { cancelled = true; };
  }, [node.id]);

  async function explain() {
    setAi({ status: "loading" });
    try {
      const res = await summarizeFile(node.id);
      setAi({ status: "done", ...res });
    } catch (e) {
      setAi({ status: "error", message: e.message });
    }
  }

  const color = LANGUAGE_COLORS[node.language] ?? LANGUAGE_COLORS.unknown;

  return (
    <aside className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">{node.label}</div>
          <div className="panel-path">{node.path}</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close">×</button>
      </div>

      <div className="panel-row">
        <span className="chip" style={{ background: color }}>{node.language}</span>
        {node.bloated && (
          <span className="chip chip-red" title="Over 500 lines of code or complexity above 50 – a candidate for splitting up">
            bloated
          </span>
        )}
      </div>

      <section>
        <h3>Metrics</h3>
        <div className="metrics">
          <Metric label="code" value={node.loc.code} />
          <Metric label="comment" value={node.loc.comment} />
          <Metric label="blank" value={node.loc.blank} />
          <Metric label="total" value={node.loc.total} />
          <Metric label="complexity" value={node.complexity} warn={node.complexity > 50}
                  title="Cyclomatic complexity: number of independent paths through the code. 1 = straight line; every if / loop / && adds one." />
        </div>
      </section>

      <section>
        <h3>AI summary</h3>
        {ai.status === "idle" && (
          <button className="primary" onClick={explain} title="Send this file to Gemini and get a 3-sentence summary (cached per file content)">
            Explain with AI
          </button>
        )}
        {ai.status === "loading" && <div className="muted">Asking Gemini…</div>}
        {ai.status === "done" && (
          <div className="summary">
            <p>{ai.summary}</p>
            <div className="muted small">
              {ai.cached ? "from cache" : "fresh"} · {ai.model}
            </div>
          </div>
        )}
        {ai.status === "error" && (
          <div className="ai-error">
            {ai.message}
            <button className="link" onClick={explain}>retry</button>
          </div>
        )}
      </section>

      <FileList title="Imports" items={imports} onSelect={onSelect} />
      <FileList title="Imported by" items={importedBy} onSelect={onSelect} />

      {node.external_imports.length > 0 && (
        <section>
          <h3>External packages</h3>
          <div className="chips">
            {node.external_imports.map((p) => <span key={p} className="chip chip-grey">{p}</span>)}
          </div>
        </section>
      )}

      <section>
        <h3>Source {file?.truncated && <span className="muted small">(preview truncated)</span>}</h3>
        <pre className="code">{file ? file.content : "Loading…"}</pre>
      </section>
    </aside>
  );
}

function Metric({ label, value, warn, title }) {
  return (
    <div className={"metric" + (warn ? " warn" : "")} title={title}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function FileList({ title, items, onSelect }) {
  return (
    <section>
      <h3>{title} <span className="muted small">({items.length})</span></h3>
      {items.length === 0
        ? <div className="muted small">none</div>
        : (
          <ul className="file-list">
            {items.map((id) => (
              <li key={id}><button className="link" onClick={() => onSelect(id)}>{id}</button></li>
            ))}
          </ul>
        )}
    </section>
  );
}
