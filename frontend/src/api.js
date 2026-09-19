// All calls to the Python backend live here, so components never hard-code URLs.
// Override with VITE_API_URL in frontend/.env if the backend runs somewhere else.
export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    // fetch() only throws when the request never got an answer: server down, wrong port, CORS.
    throw new Error(`Cannot reach the backend at ${BASE}. Is it running? Start it with ./run.sh`);
  }
  if (res.ok) return res.json();
  // FastAPI puts its error message under "detail"; fall back to the status code.
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch { /* not JSON */ }
  throw new Error(detail);
}

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getHealth = () => request("/health");
export const getSuggestions = () => request("/suggestions");
export const browseDir = (path) => request(`/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`);
export const analyzeRepo = (path, refresh = false) => request("/analyze", json({ path, refresh }));
export const isRepoUrl = (text) => /^https?:\/\//i.test(text.trim());
export const getFile = (root, path) => request(`/file?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);
export const summarizeFile = (root, path) => request("/summarize", json({ root, path }));

export const listClones = () => request("/clones");
export const removeClone = (id) => request(`/clones?id=${encodeURIComponent(id)}`, { method: "DELETE" });
export const removeAllClones = () => request("/clones?all=true", { method: "DELETE" });

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
