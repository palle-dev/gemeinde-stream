export function normalizeSpotlightKey(value: unknown): string {
  if (typeof value !== "string") throw new Error("Spotlight-Quelle ist ungültig");
  const key = value.trim();
  if (!key) return "";
  if (key.length > 240 || !/^.+-(?:camera|screen)$/.test(key) || /[\u0000-\u001f\u007f]/.test(key)) throw new Error("Spotlight-Quelle ist ungültig");
  return key;
}

export function nextSpotlightRevision(value: unknown): number {
  const revision = Number(value || 0);
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error("Spotlight-Revision ist ungültig");
  return revision + 1;
}
