import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";

export type MediaAssetType = "image" | "video" | "audio";
export interface StoredMediaAsset { id: string; name: string; path: string; type: MediaAssetType; }
export interface MediaAsset { id: string; name: string; type: MediaAssetType; url: string; }

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".mkv", ".m4v"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);

export function mediaTypeFromPath(path: string): MediaAssetType | null {
  const extension = extname(path).toLowerCase();
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  return null;
}

export function publicMediaAsset(asset: StoredMediaAsset): MediaAsset {
  return { id: asset.id, name: asset.name, type: asset.type, url: `gemeinde-media://${asset.id}/content` };
}

export async function loadMediaLibrary(path: string): Promise<StoredMediaAsset[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as StoredMediaAsset[];
    const valid: StoredMediaAsset[] = [];
    for (const asset of Array.isArray(parsed) ? parsed : []) {
      if (!asset?.id || !asset.path || !mediaTypeFromPath(asset.path)) continue;
      if ((await stat(asset.path).catch(() => null))?.isFile()) valid.push({ ...asset, type: mediaTypeFromPath(asset.path)! });
    }
    return valid;
  } catch { return []; }
}

export async function saveMediaLibrary(path: string, assets: StoredMediaAsset[]): Promise<void> {
  await writeFile(path, JSON.stringify(assets, null, 2), "utf8");
}

export function createStoredMediaAsset(path: string, name: string): StoredMediaAsset | null {
  const type = mediaTypeFromPath(path);
  return type ? { id: randomUUID(), name, path, type } : null;
}
