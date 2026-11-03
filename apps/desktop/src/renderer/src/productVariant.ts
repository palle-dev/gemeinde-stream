import type { RoomMode } from "./domain";

export type ProductVariant = "studio" | "meeting";

export function productVariantForMode(mode: string): ProductVariant {
  return mode === "meeting" ? "meeting" : "studio";
}

export function productAllowsRoom(
  variant: ProductVariant,
  mode: RoomMode,
): boolean {
  return variant === "studio" || mode === "meeting";
}

export function productRoomError(
  variant: ProductVariant,
  mode: RoomMode,
): string {
  return productAllowsRoom(variant, mode)
    ? ""
    : "Dieser Client ist ausschließlich für Meetings vorgesehen. Öffnen Sie Live-Produktionen im Gemeinde-Stream-Studio.";
}

export const PRODUCT_VARIANT = productVariantForMode(import.meta.env.MODE);
export const PRODUCT_NAME =
  PRODUCT_VARIANT === "meeting" ? "Gemeinde Meeting" : "Gemeinde Stream";
export const PRODUCT_SUBTITLE =
  PRODUCT_VARIANT === "meeting"
    ? "Meetings für Windows und macOS"
    : "Studio für Meetings und Live-Produktionen";
export const PRODUCT_PROTOCOL =
  PRODUCT_VARIANT === "meeting" ? "gemeinde-meeting" : "gemeinde-stream";
