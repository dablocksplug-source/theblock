import "dotenv/config";
import fs from "node:fs";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const d = JSON.parse(fs.readFileSync("./deployments.baseSepolia.json", "utf8"));
const rpc = process.env.RPC_URL;
if (!rpc) throw new Error("Missing RPC_URL");

const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });

const SWAP = d.contracts.BlockSwap as `0x${string}`;

const SWAP_ABI = [
  { type: "function", name: "buyPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "sellPricePerBrick", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buybackFloorPerBrick", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const [paused, sell, floor] = await Promise.all([
  client.readContract({ address: SWAP, abi: SWAP_ABI, functionName: "buyPaused" }),
  client.readContract({ address: SWAP, abi: SWAP_ABI, functionName: "sellPricePerBrick" }),
  client.readContract({ address: SWAP, abi: SWAP_ABI, functionName: "buybackFloorPerBrick" }),
]);

console.log("BlockSwap:", SWAP);
console.log("buyPaused:", paused);
console.log("sell/brick (USDC):", formatUnits(sell, 6));
console.log("floor/brick(USDC):", formatUnits(floor, 6));
