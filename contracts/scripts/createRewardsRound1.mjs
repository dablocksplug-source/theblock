import "dotenv/config";
import fs from "node:fs";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const RPC_URL = mustEnv("RPC_URL");
const DEPLOYER_PRIVATE_KEY = mustEnv("DEPLOYER_PRIVATE_KEY");
const MERKLE = mustEnv("REWARDS_MERKLE_ADDRESS");

const ROUND1_JSON = "rewards/rounds/round1/round1.proofs.json";

// 60 day claim window
const CLAIM_WINDOW_SECONDS = 60n * 24n * 60n * 60n;

// pool from file (string)
const abi = parseAbi([
  "function createRound(bytes32 root, uint64 claimEnd, uint256 poolUsdc) external returns (uint256)",
  "function roundCount() external view returns (uint256)",
]);

async function main() {
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });

  const round1 = JSON.parse(fs.readFileSync(ROUND1_JSON, "utf8"));
  const root = round1.merkleRoot;
  const poolUsdc = BigInt(round1.poolUsdc6);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const claimEnd = now + CLAIM_WINDOW_SECONDS;

  console.log("Deployer:", account.address);
  console.log("Merkle:", MERKLE);
  console.log("Root:", root);
  console.log("Pool USDC(6):", poolUsdc.toString());
  console.log("Claim end (unix):", claimEnd.toString());

  const hash = await walletClient.writeContract({
    address: MERKLE,
    abi,
    functionName: "createRound",
    args: [root, Number(claimEnd), poolUsdc],
  });

  console.log("createRound tx:", hash);
  await publicClient.waitForTransactionReceipt({ hash });

  const rc = await publicClient.readContract({
    address: MERKLE,
    abi,
    functionName: "roundCount",
  });

  console.log("✅ Round created. roundCount =", rc.toString());
}

main();
