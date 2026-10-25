import { describe, expect, it } from "vitest";
import { joinCodeFromArguments, joinCodeFromDeepLink } from "./deepLinks";

describe("join deep links", () => {
  it("reads a valid room code from path and query links", () => {
    expect(joinCodeFromDeepLink("gemeinde-stream://join/ABC23456")).toBe("ABC23456");
    expect(joinCodeFromDeepLink("gemeinde-stream://join?code=DEF34567")).toBe("DEF34567");
  });

  it("rejects foreign schemes and ambiguous characters", () => {
    expect(joinCodeFromDeepLink("https://example.de/join/ABC23456")).toBeNull();
    expect(joinCodeFromDeepLink("gemeinde-stream://join/ABCI2345")).toBeNull();
  });

  it("finds a link among Windows process arguments", () => {
    expect(joinCodeFromArguments(["electron.exe", ".", "gemeinde-stream://join/XYZ34567"])).toBe("XYZ34567");
  });
});
