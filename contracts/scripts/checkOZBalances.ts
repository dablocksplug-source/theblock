import "dotenv/config";
import fs from "node:fs";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const d = JSON.parse(fs.readFileSync("./deployments.baseSepolia.json", "utf8"));

const rpc = process.env.RPC_URL;
if (!rpc) throw new Error("Missing RPC_URL in .env");

const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });

const OZ = d.contracts.OZToken as `0x${string}`;
const SWAP = d.contracts.BlockSwap as `0x${string}`;
const DEP = d.deployer as `0x${string}`;
const RES = d.params.reserve as `0x${string}`;

// minimal OZ ABI
const OZ_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "a" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const dec = await client.readContract({ address: OZ, abi: OZ_ABI, functionName: "decimals" });

const [bSwap, bDep, bRes] = await Promise.all([
  client.readContract({ address: OZ, abi: OZ_ABI, functionName: "balanceOf", args: [SWAP] }),
  client.readContract({ address: OZ, abi: OZ_ABI, functionName: "balanceOf", args: [DEP] }),
  client.readContract({ address: OZ, abi: OZ_ABI, functionName: "balanceOf", args: [RES] }),
]);

console.log("OZ:", OZ);
console.log("SWAP:", SWAP);
console.log("DEP :", DEP);
console.log("RES :", RES);
console.log("decimals:", dec);
console.log("swap OZ   :", formatUnits(bSwap, dec));
console.log("deployer OZ:", formatUnits(bDep, dec));
console.log("reserve OZ :", formatUnits(bRes, dec));
