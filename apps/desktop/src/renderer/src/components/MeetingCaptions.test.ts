import { describe, expect, it } from "vitest";
import { appendTranscriptEntry, captionRecognitionCanRestart, meetingTranscriptText, parseCaption, type MeetingCaption } from "./MeetingCaptions";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("meeting captions", () => {
  it("accepts fresh, bounded caption messages", () => {
    expect(parseCaption(encode({ type: "caption", id: "c1", text: "  Guten Morgen  ", sentAt: 1_000 }), 1_000)).toMatchObject({ id: "c1", text: "Guten Morgen" });
  });

  it("normalizes captions to safe single-line transcript text", () => {
    expect(parseCaption(encode({ type: "caption", id: "c1", text: " Guten\n  Morgen\u0000 ", sentAt: 1_000 }), 1_000))
      .toMatchObject({ text: "Guten Morgen" });
    const transcript = meetingTranscriptText("Sonntag\nMorgen", [{ id: "c1", senderIdentity: "p1", senderName: "Lea\rAdmin", text: "Guten\nMorgen", sentAt: Date.UTC(2026, 9, 25, 9, 5, 6) }], new Date(Date.UTC(2026, 9, 25, 10, 0, 0)));
    expect(transcript).toContain("Untertitelprotokoll · Sonntag Morgen");
    expect(transcript).toContain("Lea Admin: Guten Morgen");
    expect(transcript).not.toContain("Lea\rAdmin");
  });

  it("deduplicates, orders, and bounds the local transcript", () => {
    const caption = (id: string, sentAt: number): MeetingCaption => ({ id, sentAt, senderIdentity: "p1", senderName: "Lea", text: id, expiresAt: sentAt + 10_000 });
    let entries = appendTranscriptEntry([], caption("late", 3_000), 2);
    entries = appendTranscriptEntry(entries, caption("early", 1_000), 2);
    entries = appendTranscriptEntry(entries, caption("late", 3_000), 2);
    expect(entries.map((entry) => entry.id)).toEqual(["early", "late"]);
    entries = appendTranscriptEntry(entries, caption("latest", 4_000), 2);
    expect(entries.map((entry) => entry.id)).toEqual(["late", "latest"]);
  });

  it("rejects empty and stale caption messages", () => {
    expect(parseCaption(encode({ type: "caption", id: "c1", text: "", sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseCaption(encode({ type: "caption", id: "c2", text: "Alt", sentAt: 1_000 }), 121_000)).toBeNull();
    expect(parseCaption(encode({ type: "caption", id: "", text: "Text", sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseCaption(encode({ type: "caption", id: "c3", text: "x".repeat(501), sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseCaption(encode({ type: "caption", id: "c4", text: "Text", sentAt: Number.NaN }), 1_000)).toBeNull();
    expect(parseCaption(encode({ id: "c5", text: "Text", sentAt: 1_000 }), 1_000)).toBeNull();
  });

  it("restarts only requested connected sessions after recoverable errors", () => {
    expect(captionRecognitionCanRestart(true, true, "no-speech")).toBe(true);
    expect(captionRecognitionCanRestart(true, true, "network")).toBe(true);
    expect(captionRecognitionCanRestart(false, true, "no-speech")).toBe(false);
    expect(captionRecognitionCanRestart(true, false, "no-speech")).toBe(false);
    expect(captionRecognitionCanRestart(true, true, "not-allowed")).toBe(false);
    expect(captionRecognitionCanRestart(true, true, "service-not-allowed")).toBe(false);
    expect(captionRecognitionCanRestart(true, true, "audio-capture")).toBe(false);
  });
});
