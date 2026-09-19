import { useState } from "react";

export default function RepoInput({ onAnalyze, loading }) {
  const [path, setPath] = useState("");

  function submit(e) {
    e.preventDefault();               // a <form> reloads the page by default – stop that
    if (path.trim()) onAnalyze(path.trim());
  }

  return (
    <form className="repo-input" onSubmit={submit}>
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="/absolute/path/to/repository"
        spellCheck={false}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Analysing…" : "Analyze"}
      </button>
    </form>
  );
}
