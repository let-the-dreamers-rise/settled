/** Token routes. The mainnet ids below are the expected values; the day-1 probe confirms
 * them against `GET /v0/tokens` and the first real quote (docs/probe-results.md). Override
 * with `SETTLED_ROUTES_JSON` or by passing a config object. */

export interface OriginToken {
  /** NEP-141 contract the payer holds on NEAR. */
  tokenContract: string;
  /** The same token as a 1Click asset id. */
  originAsset: string;
  decimals: number;
  symbol: string;
}

export interface Routes {
  origin: Record<string, OriginToken>;
  /** `<chain>:<SYMBOL>` -> 1Click destination asset id. */
  destination: Record<string, string>;
}

const NEAR_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export const MAINNET_ROUTES: Routes = {
  origin: {
    USDC: { tokenContract: NEAR_USDC, originAsset: `nep141:${NEAR_USDC}`, decimals: 6, symbol: "USDC" },
  },
  destination: {
    "base:USDC": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  },
};

export function routesFromEnv(env: NodeJS.ProcessEnv = process.env): Routes {
  if (!env.SETTLED_ROUTES_JSON) return MAINNET_ROUTES;
  try {
    return JSON.parse(env.SETTLED_ROUTES_JSON) as Routes;
  } catch {
    throw new Error("SETTLED_ROUTES_JSON is not valid JSON");
  }
}

/** "2" with 6 decimals -> "2000000". Exact string arithmetic, no floats. */
export function toBaseUnits(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) throw new Error(`amount ${amount} has more than ${decimals} decimals`);
  const units = BigInt(whole! + frac.padEnd(decimals, "0"));
  if (units <= 0n) throw new Error("amount must be positive");
  return units.toString();
}

export function fromBaseUnits(units: string, decimals: number): string {
  const s = units.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
