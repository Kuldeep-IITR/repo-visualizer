// All calls to the Python backend live here, so components never hard-code URLs.
const BASE = "http://localhost:8000/api";

async function handle(res) {
  if (res.ok) return res.json();
  // FastAPI puts its error message under "detail"; fall back to the status code.
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch { /* not JSON */ }
  throw new Error(detail);
}

export async function getHealth() {
  return handle(await fetch(`${BASE}/health`));
}

export async function analyzeRepo(path) {
  return handle(await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }));
}

export async function getFile(path) {
  return handle(await fetch(`${BASE}/file?path=${encodeURIComponent(path)}`));
}

export async function summarizeFile(path) {
  return handle(await fetch(`${BASE}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }));
}
