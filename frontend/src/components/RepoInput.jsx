// Controlled input: App owns the value so suggestions and the folder picker can fill it in.
export default function RepoInput({ value, onChange, onSubmit, onBrowse, loading }) {
  function submit(e) {
    e.preventDefault();               // a <form> reloads the page by default – stop that
    if (value.trim()) onSubmit(value.trim());
  }

  return (
    <form className="repo-input" onSubmit={submit}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/absolute/path/to/folder   or   https://github.com/owner/repo"
        spellCheck={false}
        title="Absolute path of a folder on this computer, or the URL of a public GitHub repository"
      />
      <button type="button" className="secondary" onClick={onBrowse} disabled={loading} title="Pick a folder by clicking through directories">
        Browse…
      </button>
      <button type="submit" className="primary" disabled={loading || !value.trim()}>
        {loading ? "Analysing…" : "Analyze"}
      </button>
    </form>
  );
}
