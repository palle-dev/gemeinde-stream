import { describe, expect, it } from "vitest";
import { canControlRaisedHands, chatMessageVisibleTo, meetingChatCsv, mergeMeetingMessages, normalizeStoredMeetingMessage, parseHandWire, parseMeetingChatRefreshSignal, reconcileMeetingMessages, safeMeetingChatResponse, shouldAnswerHandSync, unreadMeetingMessageIds, type MeetingMessage } from "./MeetingCollaboration";
import { canDeleteChatMessage, chatRateLimited, normalizeChatMessageId, normalizeChatSubmission, sameChatSubmission } from "../../../../../../base44/functions/meeting-chat/logic";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("meeting collaboration", () => {
  it("exports messages as an Excel-friendly CSV", () => {
    const csv = meetingChatCsv([{ id: "1", senderIdentity: "a", senderName: "Anna", text: "Hallo; zusammen", sentAt: Date.parse("2026-10-25T10:00:00.000Z"), isLocal: true }]);
    expect(csv.startsWith("\uFEFFZeit;Absender;Empfänger;Nachricht")).toBe(true);
    expect(csv).toContain('Anna;Alle;"Hallo; zusammen"');
  });
  it("marks private recipients in chat exports", () => {
    const csv = meetingChatCsv([{ id: "1", senderIdentity: "a", senderName: "Anna", recipientIdentity: "b", recipientName: "Bernd", text: "Nur für dich", sentAt: 0, isLocal: true }]);
    expect(csv).toContain("Anna;Bernd;Nur für dich");
  });
  it("neutralizes spreadsheet formulas in chat exports", () => {
    const csv = meetingChatCsv([{ id: "1", senderIdentity: "a", senderName: "=WEBSERVICE()", text: "+SUM(1;1)", sentAt: 0, isLocal: true }]);
    expect(csv).toContain("'=WEBSERVICE()");
    expect(csv).toContain("'+SUM(1;1)");
  });
  it("counts only unread messages from other participants", () => {
    const messages = [
      { id: "one", senderIdentity: "anna", senderName: "Anna", text: "Gelesen", sentAt: 1, isLocal: false },
      { id: "two", senderIdentity: "bernd", senderName: "Bernd", text: "Neu", sentAt: 2, isLocal: false },
      { id: "three", senderIdentity: "local", senderName: "Ich", text: "Gesendet", sentAt: 3, isLocal: true },
    ] as MeetingMessage[];
    expect(unreadMeetingMessageIds(messages, new Set(["one"]))).toEqual(["two"]);
  });
  it("shows direct messages only to their intended recipient", () => {
    expect(chatMessageVisibleTo({ senderIdentity: "bernd" }, "anna")).toBe(true);
    expect(chatMessageVisibleTo({ senderIdentity: "bernd", recipientIdentity: "anna" }, "anna")).toBe(true);
    expect(chatMessageVisibleTo({ senderIdentity: "anna", recipientIdentity: "bernd" }, "anna")).toBe(true);
    expect(chatMessageVisibleTo({ senderIdentity: "bernd", recipientIdentity: "carla" }, "anna")).toBe(false);
  });
  it("merges persisted history chronologically without duplicates or foreign private messages", () => {
    const current = [{ id: "two", senderIdentity: "anna", senderName: "Anna", text: "Zwei", sentAt: 2, isLocal: true }] as MeetingMessage[];
    expect(mergeMeetingMessages(current, [
      { id: "one", senderIdentity: "bernd", senderName: "Bernd", text: "Eins", sentAt: 1 },
      { id: "two", senderIdentity: "anna", senderName: "Anna", text: "Zwei", sentAt: 2 },
      { id: "sent-secret", senderIdentity: "anna", senderName: "Anna", recipientIdentity: "bernd", recipientName: "Bernd", text: "Privat gesendet", sentAt: 3 },
      { id: "secret", senderIdentity: "bernd", senderName: "Bernd", recipientIdentity: "carla", recipientName: "Carla", text: "Geheim", sentAt: 3 },
    ], "anna").map((message) => message.id)).toEqual(["one", "two", "sent-secret"]);
  });
  it("accepts only fresh chat refresh hints and never transported message content", () => {
    expect(parseMeetingChatRefreshSignal(encode({ type: "refresh", id: "12345678-abcd", messageId: "message-1", sentAt: 1_000 }), 1_000)).toMatchObject({ messageId: "message-1" });
    expect(parseMeetingChatRefreshSignal(encode({ type: "chat", id: "12345678-abcd", messageId: "message-1", text: "ungeprüft", sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseMeetingChatRefreshSignal(encode({ type: "refresh", id: "12345678-abcd", messageId: "message-1", sentAt: 1_000 }), 62_000)).toBeNull();
  });
  it("strictly validates persisted chat responses", () => {
    const message = { id: "1", senderIdentity: "anna", senderName: "Anna", text: "Hallo", sentAt: 1_000 };
    expect(normalizeStoredMeetingMessage(message, 1_000)).toEqual(message);
    expect(safeMeetingChatResponse({ messages: [message] })).toEqual([message]);
    expect(() => safeMeetingChatResponse({ messages: [{ ...message, senderName: "Anna\nHost" }] })).toThrow();
    expect(() => safeMeetingChatResponse({ messages: Array.from({ length: 101 }, () => message) })).toThrow();
  });
  it("does not let a colliding packet replace an existing message", () => {
    const current = [{ id: "same", senderIdentity: "anna", senderName: "Anna", text: "Original", sentAt: 1, isLocal: false }] as MeetingMessage[];
    expect(mergeMeetingMessages(current, [{ id: "same", senderIdentity: "bernd", senderName: "Bernd", text: "Ersetzt", sentAt: 2 }], "carla")).toEqual(current);
  });
  it("removes messages missing from the authoritative refreshed history", () => {
    expect(reconcileMeetingMessages([{ id: "kept", senderIdentity: "bernd", senderName: "Bernd", text: "Bleibt", sentAt: 2 }], "anna").map((message) => message.id)).toEqual(["kept"]);
  });
  it("allows authors and moderators to delete only appropriate chat messages", () => {
    const publicMessage = { sender_identity: "anna", recipient_identity: "" };
    const privateMessage = { sender_identity: "anna", recipient_identity: "bernd" };
    expect(canDeleteChatMessage(publicMessage, "anna", "participant")).toBe(true);
    expect(canDeleteChatMessage(publicMessage, "host", "host")).toBe(true);
    expect(canDeleteChatMessage(privateMessage, "host", "host")).toBe(false);
    expect(canDeleteChatMessage(privateMessage, "anna", "participant")).toBe(true);
    expect(normalizeChatMessageId("message-1")).toBe("message-1");
    expect(normalizeChatMessageId("message\n1")).toBeNull();
  });
  it("validates idempotent sends and limits bursts", () => {
    const submission = normalizeChatSubmission({ id: "id-1", text: " Hallo ", recipientIdentity: "b", recipientName: "Bernd" });
    expect(submission.text).toBe("Hallo");
    expect(sameChatSubmission({ sender_identity: "a", text: "Hallo", recipient_identity: "b", recipient_name: "Bernd" }, "a", submission)).toBe(true);
    expect(() => normalizeChatSubmission({ id: "id-2", text: "x".repeat(2001) })).toThrow(/2000/);
    expect(() => normalizeChatSubmission({ id: "id-3\n", text: "Hallo" })).toThrow(/kennung/i);
    expect(chatRateLimited(Array.from({ length: 20 }, () => ({ sent_at: "2026-10-26T10:00:00.000Z" })), Date.parse("2026-10-26T10:00:05.000Z"))).toBe(true);
  });
  it("accepts hand moderation only from verified meeting roles", () => {
    expect(canControlRaisedHands(JSON.stringify({ role: "host" }))).toBe(true);
    expect(canControlRaisedHands(JSON.stringify({ role: "operator" }))).toBe(true);
    expect(canControlRaisedHands(JSON.stringify({ role: "participant" }))).toBe(false);
    expect(canControlRaisedHands("invalid")).toBe(false);
  });
  it("answers late-join synchronization only for the locally raised hand", () => {
    const raised = new Set(["anna"]);
    expect(shouldAnswerHandSync(raised, "anna")).toBe(true);
    expect(shouldAnswerHandSync(raised, "bernd")).toBe(false);
  });
  it("accepts only fresh and structurally valid hand signals", () => {
    expect(parseHandWire(encode({ type: "hand", id: "h1", raised: true, sentAt: 1_000 }), 1_000)).toEqual({ type: "hand", id: "h1", raised: true, sentAt: 1_000 });
    expect(parseHandWire(encode({ type: "hand-command", id: "h2", targetIdentity: "anna", sentAt: 1_000 }), 1_000)).toEqual({ type: "hand-command", id: "h2", targetIdentity: "anna", sentAt: 1_000 });
    expect(parseHandWire(encode({ type: "hand", id: "h3", raised: "yes", sentAt: 1_000 }), 1_000)).toBeNull();
    expect(parseHandWire(encode({ type: "hand", id: "h4", raised: true, sentAt: Number.NaN }), 1_000)).toBeNull();
    expect(parseHandWire(encode({ type: "hand", id: "h5", raised: true, sentAt: 1_000 }), 120_000)).toBeNull();
  });
});
