import { describe, expect, it } from "vitest";
import { redactDiagnosticText } from "./diagnostics";

describe("redactDiagnosticText", () => {
  it("masks credentials and RTMP paths", () => {
    const redacted = redactDiagnosticText(
      "API_SECRET=top-secret token:abc123 rtmps://stream.example/live/key-456",
    );

    expect(redacted).not.toContain("top-secret");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("key-456");
    expect(redacted).toContain("[geschützt]");
  });

  it("limits unexpectedly large diagnostic messages", () => {
    expect(redactDiagnosticText("x".repeat(20_000))).toHaveLength(12_000);
  });
});
