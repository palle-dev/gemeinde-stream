import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const outputStyles = `
  :root { color-scheme: dark; background: #000; }
  * { box-sizing: border-box; }
  html, body, #gemeinde-stream-program-root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #000; }
  body { font-family: Inter, "Segoe UI", sans-serif; }
  .program-layout { position: relative; width: 100%; height: 100%; display: grid; gap: 0; background: #000; }
  .program-layout.side_by_side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .program-layout.picture_in_picture > .participant-tile:first-child { position: absolute; inset: 0; }
  .program-layout.picture_in_picture > .participant-tile:nth-child(2) { position: absolute; z-index: 2; width: 30%; height: 30%; right: 3%; bottom: 4%; border: 2px solid #fff; box-shadow: 0 10px 40px #000c; }
  .participant-tile { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: #000; }
  .video-placeholder { width: 100%; height: 100%; display: grid; place-items: center; background: radial-gradient(circle at 50% 40%, #20313a, #080b10 60%); }
  .video-placeholder video { width: 100%; height: 100%; object-fit: cover; background: #000; }
  .avatar { width: 9vw; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: #1d3940; color: #d9fffb; font-size: 3vw; font-weight: 700; }
  .tile-label, .tile-hand { display: none; }
`;

export function ProgramOutputWindow({ open, children, onClosed, onError }: { open: boolean; children: ReactNode; onClosed: () => void; onError: (message: string) => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const outputWindow = window.open("", "gemeinde-stream-program-output", "popup=yes,width=1920,height=1080");
    if (!outputWindow) {
      onError("Das Programmausgabefenster konnte nicht geöffnet werden.");
      onClosed();
      return;
    }

    outputWindow.document.title = "Gemeinde Stream · Programmausgabe";
    outputWindow.document.head.replaceChildren();
    const style = outputWindow.document.createElement("style");
    style.textContent = outputStyles;
    outputWindow.document.head.appendChild(style);
    const root = outputWindow.document.createElement("div");
    root.id = "gemeinde-stream-program-root";
    outputWindow.document.body.replaceChildren(root);
    setContainer(root);

    const closed = () => {
      setContainer(null);
      onClosed();
    };
    outputWindow.addEventListener("beforeunload", closed, { once: true });
    outputWindow.focus();

    return () => {
      outputWindow.removeEventListener("beforeunload", closed);
      if (!outputWindow.closed) outputWindow.close();
      setContainer(null);
    };
  }, [onClosed, onError, open]);

  return container ? createPortal(children, container) : null;
}
