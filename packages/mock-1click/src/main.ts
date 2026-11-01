import { startMock } from "./server.js";

const rpcUrl = process.env.NEAR_RPC_URL;
const tokenContract = process.env.MOCK_TOKEN_CONTRACT;
const depositAddresses = (process.env.MOCK_DEPOSIT_ADDRESSES ?? "").split(",").filter(Boolean);
if (!rpcUrl || !tokenContract || depositAddresses.length === 0) {
  console.error("MOCK needs NEAR_RPC_URL, MOCK_TOKEN_CONTRACT and MOCK_DEPOSIT_ADDRESSES (comma-separated)");
  process.exit(2);
}
await startMock({
  port: Number(process.env.MOCK_PORT ?? 3911),
  rpcUrl,
  tokenContract,
  depositAddresses,
  log: (l) => console.log(l),
});
