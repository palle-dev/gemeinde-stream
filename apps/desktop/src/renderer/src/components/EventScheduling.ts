export function defaultStartTime(now = new Date()): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
  return toDateTimeInput(next.toISOString());
}

export function toDateTimeInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toIsoDateTime(localValue: string): string {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) throw new Error("Bitte eine gültige Startzeit auswählen.");
  return date.toISOString();
}
