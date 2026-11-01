import run from "@/fixtures/run.json";

/** DEMO MODE is the default on the hosted site: the console replays a recorded run. The
 * receipt page and the usage meter always read the chain. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://rpc.mainnet.near.org";
export const CONTRACT_ID = process.env.NEXT_PUBLIC_SETTLED_CONTRACT_ID || run.contract_id;
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://nearblocks.io";
export const INTENTS_EXPLORER = "https://explorer.near-intents.org";
