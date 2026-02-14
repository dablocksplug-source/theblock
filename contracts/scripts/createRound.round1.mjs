// scripts/createRound.round1.mjs
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) throw new Error("Missing RPC_URL env var in this terminal");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY env var (deployer/owner)");

const REWARDS_ADDRESS = (process.env.REWARDS_ADDRESS || "").trim();
const USDC_ADDRESS = (process.env.USDC_ADDRESS || "").trim();

if (!REWARDS_ADDRESS) throw new Error("Missing REWARDS_ADDRESS env var");
if (!USDC_ADDRESS) throw new Error("Missing USDC_ADDRESS env var");

const merkle = JSON.parse(fs.readFileSync("rewards/round1/merkle.round1.json", "utf8"));

const MERKLE_ROOT = merkle.merkleRoot;
const CLAIM_END = BigInt(merkle.claimEnd);
const POOL_USDC_6 = BigInt(merkle.poolUsdc6);

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

const REWARDS_ABI = parseAbi([
  "function createRound(bytes32 root, uint64 claimEnd, uint256 poolUsdc) returns (uint256)",
]);

async function main() {
  console.log("Using wallet:", account.address);
  console.log("Rewards:", REWARDS_ADDRESS);
  console.log("USDC:", USDC_ADDRESS);
  console.log("Root:", MERKLE_ROOT);
  console.log("ClaimEnd:", CLAIM_END.toString());
  console.log("PoolUsdc6:", POOL_USDC_6.toString());

  // 1) ensure allowance
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, REWARDS_ADDRESS],
  });

  if (allowance < POOL_USDC_6) {
    console.log("Approving USDC...");
    const approveHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [REWARDS_ADDRESS, POOL_USDC_6],
    });
    console.log("approve tx:", approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("✅ Approved");
  } else {
    console.log("✅ Allowance already sufficient");
  }

  // 2) create round
  console.log("Creating round...");
  const createHash = await walletClient.writeContract({
    address: REWARDS_ADDRESS,
    abi: REWARDS_ABI,
    functionName: "createRound",
    args: [MERKLE_ROOT, Number(CLAIM_END), POOL_USDC_6],
  });

  console.log("createRound tx:", createHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  console.log("✅ createRound confirmed. status:", receipt.status);
  console.log("Done.");
}

main().catch((e) => {
  console.error("ERR:", e?.shortMessage || e?.message || e);
  process.exit(1);
});
