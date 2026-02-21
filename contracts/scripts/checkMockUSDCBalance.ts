import "dotenv/config";
import fs from "node:fs";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const d = JSON.parse(fs.readFileSync("./deployments.baseSepolia.json", "utf8"));
const rpc = (process.env.BASE_SEPOLIA_RPC || process.env.RPC_URL || "").trim();
if (!rpc) throw new Error("Missing BASE_SEPOLIA_RPC or RPC_URL");

const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });

const USDC = d.contracts.MockUSDC as `0x${string}`;
const who = (process.argv[2] || d.params.treasury) as `0x${string}`;

const ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const chainId = await client.getChainId();
const [dec, sym, bal] = await Promise.all([
  client.readContract({ address: USDC, abi: ABI, functionName: "decimals" }).catch(() => 6),
  client.readContract({ address: USDC, abi: ABI, functionName: "symbol" }).catch(() => "USDC"),
  client.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [who] }),
]);

console.log("ChainId:", chainId);
console.log("MockUSDC:", USDC);
console.log("Wallet  :", who);
console.log("Balance :", formatUnits(bal, Number(dec)), sym);
