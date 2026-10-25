import { useEffect, useState } from "react";
import { FileImage, Film, Music2, Plus, Trash2 } from "lucide-react";

export interface LocalMediaAsset { id: string; name: string; type: "image" | "video" | "audio"; url: string; }

export function useMediaLibrary() {
  const [assets, setAssets] = useState<LocalMediaAsset[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!window.desktop) return;
    window.desktop.listMedia().then(setAssets).catch((cause) => setError(cause instanceof Error ? cause.message : "Medienbibliothek konnte nicht geladen werden."));
  }, []);
  async function add() {
    try {
      const added = await window.desktop.pickMedia();
      setAssets((current) => [...current, ...added.filter((asset) => !current.some((candidate) => candidate.id === asset.id))]);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Medien konnten nicht hinzugefügt werden."); }
  }
  async function remove(assetId: string) {
    try { await window.desktop.removeMedia(assetId); setAssets((current) => current.filter((asset) => asset.id !== assetId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Medium konnte nicht entfernt werden."); }
  }
  return { assets, error, add, remove };
}

function MediaPreview({ asset }: { asset: LocalMediaAsset }) {
  if (asset.type === "image") return <img src={asset.url} alt="" />;
  if (asset.type === "video") return <video src={asset.url} muted preload="metadata" />;
  return <div className="media-audio-preview"><Music2 /></div>;
}

export function MediaLibrary({ assets, selectedIds, canControl, error, onAdd, onRemove, onSelect }: { assets: LocalMediaAsset[]; selectedIds: string[]; canControl: boolean; error: string; onAdd: () => Promise<void>; onRemove: (id: string) => Promise<void>; onSelect: (id: string) => void }) {
  return <section className="media-library"><div className="media-library-heading"><span><b>Medienbibliothek</b><small>{assets.length} lokale Medien</small></span>{canControl && <button onClick={() => void onAdd()} title="Medien hinzufügen"><Plus /></button>}</div><div className="media-library-grid">{assets.map((asset) => <article key={asset.id} className={selectedIds.includes(`media-${asset.id}`) ? "selected" : ""}><button className="media-select" disabled={!canControl} onClick={() => onSelect(`media-${asset.id}`)}><div><MediaPreview asset={asset} /></div><span>{asset.type === "image" ? <FileImage /> : asset.type === "video" ? <Film /> : <Music2 />}{asset.name}</span></button>{canControl && <button className="media-remove" title="Aus Bibliothek entfernen" onClick={() => void onRemove(asset.id)}><Trash2 /></button>}</article>)}</div>{assets.length === 0 && <p>Noch keine Bilder, Videos oder Audiodateien.</p>}{error && <div className="inline-error">{error}</div>}</section>;
}
