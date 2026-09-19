const GitHubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

import { formatBytes } from "../api";

// The empty state: what to do, plus one-click starting points.
export default function Welcome({ suggestions, recents, clones = [], onPick, onBrowse, onRemoveClone, onRemoveAllClones, loading }) {
  const totalBytes = clones.reduce((s, c) => s + c.size_bytes, 0);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h2>Map any codebase in seconds</h2>
        <p className="muted">
          Point this tool at a folder on your computer. It reads the source files, works out which
          file imports which, and draws the result as an interactive map with metrics and AI summaries.
        </p>

        <ol className="steps">
          <li><b>Pick a folder</b> with the Browse button, a suggestion below, or by pasting a path. Or <b>paste a GitHub URL</b> and it is downloaded for you.</li>
          <li><b>Click Analyze.</b> Nothing is executed and nothing leaves your machine except the file you ask the AI about.</li>
          <li><b>Click any file</b> on the map to see its imports, metrics and a plain-English summary.</li>
        </ol>

        <div className="welcome-actions">
          <button className="primary" onClick={onBrowse} disabled={loading}>Browse folders…</button>
          {suggestions.filter((s) => s.kind !== "remote").map((s) => (
            <button key={s.path} className="secondary" onClick={() => onPick(s.path)} disabled={loading} title={s.path}>
              {s.label}
            </button>
          ))}
        </div>
        {suggestions.some((s) => s.kind === "remote") && (
          <div className="welcome-remote">
            <span className="muted small">Or try a public GitHub repository:</span>
            {suggestions.filter((s) => s.kind === "remote").map((s) => (
              <button key={s.path} className="secondary small-btn" onClick={() => onPick(s.path)} disabled={loading} title={s.path}>
                <GitHubIcon /> {s.label}
              </button>
            ))}
          </div>
        )}

        {recents.length > 0 && (
          <div className="recents">
            <div className="muted small">Recently analysed</div>
            {recents.map((p) => (
              <button key={p} className="link" onClick={() => onPick(p)} disabled={loading}>{p}</button>
            ))}
          </div>
        )}

        {clones.length > 0 && (
          <div className="clones">
            <div className="clones-head">
              <span>Downloaded repositories <span className="muted small">({clones.length}, {formatBytes(totalBytes)} on disk)</span></span>
              <button className="link" onClick={onRemoveAllClones} disabled={loading}>Remove all</button>
            </div>
            <ul>
              {clones.map((c) => (
                <li key={c.id}>
                  <button className="link clone-name" onClick={() => onPick(c.url)} disabled={loading} title={`Analyse ${c.url}`}>
                    {c.url.replace(/^https?:\/\//, "")}
                  </button>
                  <span className="muted small">@{c.commit} · {formatBytes(c.size_bytes)}</span>
                  <button className="link clone-remove" onClick={() => onRemoveClone(c)} disabled={loading} title="Delete this download">
                    remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="muted small">Downloads are kept so re-analysing is instant. Remove them whenever you like; they can be fetched again.</div>
          </div>
        )}

        <p className="muted small">
          Supports Python, JavaScript, TypeScript, C and C++. Folders like <code>node_modules</code>,
          <code>.git</code> and virtualenvs are skipped automatically, and your <code>.gitignore</code> is respected.
        </p>
      </div>
    </div>
  );
}
