export interface ReleaseUpdate {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseUrl: string;
}

export function normalizeVersion(value: string): string | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = normalizeVersion(candidate);
  const installed = normalizeVersion(current);
  if (!next || !installed) return false;
  const nextParts = next.split(".").map(Number);
  const installedParts = installed.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (nextParts[index] > installedParts[index]) return true;
    if (nextParts[index] < installedParts[index]) return false;
  }
  return false;
}

export function trustedReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith("/palle-dev/gemeinde-stream/releases/")
    );
  } catch {
    return false;
  }
}
