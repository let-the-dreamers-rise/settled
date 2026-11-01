export function fromBaseUnits(units: string, decimals = 6): string {
  const s = units.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function evidenceOf(raw: string | null): { status?: string; destinationTx?: string[]; mock?: boolean } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { status?: string; destinationTx?: string[]; mock?: boolean };
  } catch {
    return {};
  }
}

export function when(ms: number | null): string {
  if (!ms) return "not yet";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
