import { useEffect, useState } from "react";
import Modal from "./Modal";
import { browseDir } from "../api";

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

// Click-through directory browser so nobody has to type a path by hand.
export default function FolderPicker({ initialPath, onPick, onClose }) {
  const [listing, setListing] = useState(null);
  const [error, setError] = useState("");

  async function open(path) {
    setError("");
    try {
      setListing(await browseDir(path));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { open(initialPath || null); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Choose a folder to analyse" onClose={onClose} width={640}>
      <div className="picker-bar">
        <button className="secondary" onClick={() => open(listing?.parent)} disabled={!listing?.parent} title="Go to parent folder">
          ↑ Up
        </button>
        <code className="picker-path" title={listing?.path}>{listing?.path ?? "…"}</code>
      </div>

      {error && <div className="ai-error">{error}</div>}

      <ul className="picker-list">
        {listing?.entries.map((e) => (
          <li key={e.path} className="picker-row">
            <button className="picker-open" onClick={() => open(e.path)} title={`Open ${e.name}`}>
              <FolderIcon />
              <span className="picker-name">{e.name}</span>
              {e.is_repo && <span className="chip chip-green">git repo</span>}
            </button>
            <button className="link picker-select" onClick={() => onPick(e.path)}>Analyze ›</button>
          </li>
        ))}
        {listing && listing.entries.length === 0 && (
          <li className="muted small picker-empty">No sub-folders here.</li>
        )}
      </ul>

      <div className="picker-foot">
        <span className="muted small">Click a folder to open it. Folders with a green tag contain a Git repository.</span>
        <button className="primary" onClick={() => onPick(listing.path)} disabled={!listing}>
          Analyze this folder
        </button>
      </div>
    </Modal>
  );
}
