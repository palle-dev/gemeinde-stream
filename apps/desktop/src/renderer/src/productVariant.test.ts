import { describe, expect, it } from "vitest";
import {
  productAllowsRoom,
  productRoomError,
  productVariantForMode,
} from "./productVariant";

describe("product variants", () => {
  it("selects the meeting product only for its explicit build mode", () => {
    expect(productVariantForMode("meeting")).toBe("meeting");
    expect(productVariantForMode("production")).toBe("studio");
    expect(productVariantForMode("test")).toBe("studio");
  });

  it("prevents the meeting client from opening broadcast rooms", () => {
    expect(productAllowsRoom("meeting", "meeting")).toBe(true);
    expect(productAllowsRoom("meeting", "broadcast")).toBe(false);
    expect(productAllowsRoom("studio", "broadcast")).toBe(true);
    expect(productRoomError("meeting", "broadcast")).toContain(
      "ausschließlich für Meetings",
    );
  });
});
