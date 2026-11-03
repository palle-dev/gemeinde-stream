export interface ChatSubmission {
  id: string;
  text: string;
  recipientIdentity: string;
  recipientName: string;
}

export function normalizeChatMessageId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

export function canDeleteChatMessage(message: Record<string, unknown>, actorIdentity: string, actorRole: string): boolean {
  if (message.sender_identity === actorIdentity) return true;
  const isPublic = !String(message.recipient_identity ?? "");
  return isPublic && ["admin", "host", "cohost", "operator"].includes(actorRole);
}

export function normalizeChatSubmission(body: Record<string, unknown>): ChatSubmission {
  if (!normalizeChatMessageId(body.id)) throw new Error("Die Nachrichtenkennung ist ungültig");
  if (typeof body.text !== "string") throw new Error("Die Nachricht ist ungültig");
  const text = body.text.trim();
  if (!text || text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("Die Nachricht muss zwischen 1 und 2000 Zeichen lang sein und darf keine Steuerzeichen enthalten");
  if (body.recipientIdentity !== undefined && typeof body.recipientIdentity !== "string") throw new Error("Der Nachrichtenempfänger ist ungültig");
  if (body.recipientName !== undefined && typeof body.recipientName !== "string") throw new Error("Der Empfängername ist ungültig");
  const recipientIdentity = String(body.recipientIdentity ?? "").trim();
  const recipientName = String(body.recipientName ?? "").trim();
  if (recipientIdentity.length > 200 || recipientName.length > 80 || /[\u0000-\u001f\u007f]/.test(recipientIdentity) || /[\u0000-\u001f\u007f]/.test(recipientName) || (recipientIdentity && !recipientName) || (!recipientIdentity && recipientName)) throw new Error("Der Nachrichtenempfänger ist ungültig");
  return { id: body.id as string, text, recipientIdentity, recipientName };
}

export function sameChatSubmission(message: Record<string, unknown>, actorIdentity: string, submission: ChatSubmission): boolean {
  return message.sender_identity === actorIdentity
    && message.text === submission.text
    && String(message.recipient_identity ?? "") === submission.recipientIdentity
    && String(message.recipient_name ?? "") === submission.recipientName;
}

export function chatRateLimited(messages: Array<Record<string, unknown>>, now = Date.now(), limit = 20, windowMs = 10_000): boolean {
  return messages.filter((message) => {
    const timestamp = Date.parse(String(message.sent_at ?? message.created_date ?? ""));
    return Number.isFinite(timestamp) && timestamp >= now - windowMs && timestamp <= now + 60_000;
  }).length >= limit;
}
