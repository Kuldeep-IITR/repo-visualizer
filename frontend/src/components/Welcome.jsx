// The empty state: what to do, plus one-click starting points.
export default function Welcome({ suggestions, recents, onPick, onBrowse, loading }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h2>Map any codebase in seconds</h2>
        <p className="muted">
          Point this tool at a folder on your computer. It reads the source files, works out which
          file imports which, and draws the result as an interactive map with metrics and AI summaries.
        </p>

        <ol className="steps">
          <li><b>Pick a folder</b> with the Browse button, a suggestion below, or by pasting a path.</li>
          <li><b>Click Analyze.</b> Nothing is executed and nothing leaves your machine except the file you ask the AI about.</li>
          <li><b>Click any file</b> on the map to see its imports, metrics and a plain-English summary.</li>
        </ol>

        <div className="welcome-actions">
          <button className="primary" onClick={onBrowse} disabled={loading}>Browse folders…</button>
          {suggestions.map((s) => (
            <button key={s.path} className="secondary" onClick={() => onPick(s.path)} disabled={loading} title={s.path}>
              {s.label}
            </button>
          ))}
        </div>

        {recents.length > 0 && (
          <div className="recents">
            <div className="muted small">Recently analysed</div>
            {recents.map((p) => (
              <button key={p} className="link" onClick={() => onPick(p)} disabled={loading}>{p}</button>
            ))}
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
