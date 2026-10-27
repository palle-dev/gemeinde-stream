export function redactDiagnosticText(value: unknown): string {
  return String(value ?? "")
    .replace(
      /((?:api[_ -]?secret|stream[_ -]?key|authorization|access[_ -]?token|refresh[_ -]?token|token)\s*[=:]\s*)([^\s,;]+)/gi,
      "$1[geschützt]",
    )
    .replace(/(rtmps?:\/\/[^\s/]+\/)[^\s]+/gi, "$1[geschützt]")
    .slice(0, 12_000);
}
