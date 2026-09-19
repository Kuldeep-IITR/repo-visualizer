import { useEffect } from "react";

// Shared dialog shell: dark backdrop, close on Escape or backdrop click.
export default function Modal({ title, onClose, children, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
