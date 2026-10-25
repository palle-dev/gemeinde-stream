const JOIN_CODE = /^[A-HJ-NP-Z2-9]{6,12}$/;

export function joinCodeFromDeepLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "gemeinde-stream:" || url.hostname.toLowerCase() !== "join") return null;
    const code = (url.pathname.split("/").filter(Boolean)[0] || url.searchParams.get("code") || "").toUpperCase();
    return JOIN_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function joinCodeFromArguments(argumentsList: string[]): string | null {
  for (const argument of argumentsList) {
    const code = joinCodeFromDeepLink(argument);
    if (code) return code;
  }
  return null;
}
