import { useEffect, useState } from "react";

export type ProductionProfileId = "efficient" | "standard" | "quality";
export interface ProductionProfile {
  id: ProductionProfileId;
  label: string;
  description: string;
  width: number;
  height: number;
  frameRate: 30 | 60;
  recordingVideoBitrate: number;
  streamingVideoBitrateKbps: number;
}

export const PRODUCTION_PROFILES: readonly ProductionProfile[] = [
  {
    id: "efficient",
    label: "720p30",
    description: "Für schwächere Rechner oder begrenzte Uploads",
    width: 1280,
    height: 720,
    frameRate: 30,
    recordingVideoBitrate: 6_000_000,
    streamingVideoBitrateKbps: 3_500,
  },
  {
    id: "standard",
    label: "1080p30",
    description: "Empfohlen für Gottesdienste und längere Übertragungen",
    width: 1920,
    height: 1080,
    frameRate: 30,
    recordingVideoBitrate: 9_000_000,
    streamingVideoBitrateKbps: 6_000,
  },
  {
    id: "quality",
    label: "1080p60",
    description: "Für Bewegung und leistungsstarke Produktionsrechner",
    width: 1920,
    height: 1080,
    frameRate: 60,
    recordingVideoBitrate: 12_000_000,
    streamingVideoBitrateKbps: 8_000,
  },
];

const STORAGE_KEY = "gemeinde-stream.production-profile.v1";
const CHANGE_EVENT = "gemeinde-stream:production-profile";

export function productionProfile(id?: string | null): ProductionProfile {
  return (
    PRODUCTION_PROFILES.find((profile) => profile.id === id) ??
    PRODUCTION_PROFILES[1]
  );
}

export function currentProductionProfile(): ProductionProfile {
  try {
    return productionProfile(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return productionProfile("standard");
  }
}

export function recommendProductionProfile(
  logicalCpuCount: number,
  totalMemoryBytes: number,
): ProductionProfileId {
  const memoryGiB = totalMemoryBytes / 1024 ** 3;
  if (logicalCpuCount >= 12 && memoryGiB >= 24) return "quality";
  if (logicalCpuCount >= 6 && memoryGiB >= 12) return "standard";
  return "efficient";
}

export function useProductionProfile() {
  const [profile, setProfileState] = useState(currentProductionProfile);
  useEffect(() => {
    const sync = () => setProfileState(currentProductionProfile());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setProfile = (id: ProductionProfileId) => {
    localStorage.setItem(STORAGE_KEY, id);
    setProfileState(productionProfile(id));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return { profile, setProfile };
}
