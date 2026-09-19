"""
AI summaries with a content-hash cache.

Flow for POST /api/summarize:
    read file -> sha256(content) -> cache hit?  yes -> return instantly
                                     no  -> call Gemini -> store -> return

The cache key is the hash of the file's CONTENT, not its path. Rename a file and
the summary is still valid; change one character and it is re-generated. That is
what keeps API usage (and cost) proportional to how much code actually changed.
"""
import hashlib
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Read backend/.env into os.environ (does nothing if the file doesn't exist).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
DB_PATH = Path(__file__).resolve().parent.parent / "summaries.db"
MAX_AI_CHARS = 40_000       # ~10k tokens; enough for any sane source file, keeps us in free tier
PROMPT = "Explain what this code does in 3 simple sentences."


class AIError(Exception):
    """Carries an HTTP status so main.py can map it directly."""
    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- cache
def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            content_hash TEXT NOT NULL,
            model        TEXT NOT NULL,
            summary      TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            PRIMARY KEY (content_hash, model)
        )
    """)
    return conn


def cache_get(content_hash: str, model: str) -> str | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT summary FROM summaries WHERE content_hash = ? AND model = ?",
            (content_hash, model),
        ).fetchone()
    return row[0] if row else None


def cache_put(content_hash: str, model: str, summary: str) -> None:
    with _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO summaries VALUES (?, ?, ?, ?)",
            (content_hash, model, summary, datetime.now(timezone.utc).isoformat()),
        )


# ---------------------------------------------------------------- Gemini
def _call_gemini(filename: str, code: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_key_here":
        raise AIError(
            "GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.",
            status=503,
        )

    from google import genai              # imported here so the app starts even without the SDK configured
    from google.genai import errors

    client = genai.Client(api_key=api_key)
    contents = f"{PROMPT}\n\nFile: {filename}\n\n```\n{code}\n```"
    try:
        response = client.models.generate_content(model=MODEL, contents=contents)
    except errors.APIError as e:
        if e.code == 429:
            raise AIError("Gemini rate limit hit. Wait a minute and try again.", status=429)
        raise AIError(f"Gemini error {e.code}: {e.message}", status=502)
    except Exception as e:                # network down, DNS, timeout ...
        raise AIError(f"Could not reach Gemini: {e}", status=502)

    text = (response.text or "").strip()
    if not text:
        raise AIError("Gemini returned an empty response.", status=502)
    return text


# ---------------------------------------------------------------- public API
def summarize(abs_path: Path, rel_path: str, generate=_call_gemini) -> tuple[str, bool, str]:
    """
    Returns (summary, cached, model).
    `generate` is injectable so the cache logic can be tested without an API key.
    """
    raw = abs_path.read_bytes()
    content_hash = hashlib.sha256(raw).hexdigest()

    hit = cache_get(content_hash, MODEL)
    if hit is not None:
        return hit, True, MODEL

    code = raw.decode("utf-8", errors="replace")
    if len(code) > MAX_AI_CHARS:
        code = code[:MAX_AI_CHARS] + "\n... (truncated)"

    summary = generate(rel_path, code)
    cache_put(content_hash, MODEL, summary)
    return summary, False, MODEL
