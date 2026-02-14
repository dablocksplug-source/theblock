// scripts/claimRewardsRound1.mjs
import "dotenv/config";
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const RPC_URL = mustEnv("RPC_URL");
const MERKLE = mustEnv("REWARDS_MERKLE_ADDRESS");
const PROOFS_PATH = mustEnv("PROOFS_PATH");

// NOTE: you can keep using DEPLOYER_PRIVATE_KEY as your env name,
// but it MUST be the private key of the wallet that is claiming.
const PRIVATE_KEY = mustEnv("DEPLOYER_PRIVATE_KEY");

const CLAIM_WALLET_ENV = (process.env.CLAIM_WALLET || "").trim();

const account = privateKeyToAccount(PRIVATE_KEY);

const targetWallet = (CLAIM_WALLET_ENV || account.address).toLowerCase();

if (!isAddress(MERKLE)) throw new Error("Bad REWARDS_MERKLE_ADDRESS");
if (!isAddress(targetWallet)) throw new Error("Bad CLAIM_WALLET");

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
});

const walletClient = createWalletClient({
  chain: baseSepolia,
  account,
  transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
});

const ABI = parseAbi([
  "function roundCount() view returns (uint256)",
  "function rounds(uint256) view returns (bytes32 merkleRoot,uint64 claimEnd,uint256 remainingUsdc)",
  "function claimed(uint256,address) view returns (bool)",
  "function claim(uint256 roundId,uint256 eligibleOzWei,uint256 payoutUsdc,bytes32[] proof)",
]);

async function main() {
  console.log("Claim wallet:", CLAIM_WALLET_ENV || account.address);
  console.log("Using target wallet:", targetWallet);
  console.log("Merkle:", MERKLE);
  console.log("Proofs file:", PROOFS_PATH);

  const raw = JSON.parse(fs.readFileSync(PROOFS_PATH, "utf8"));
  const roundId = BigInt(raw.round || 1);

  console.log("Round:", Number(roundId));
  console.log("Entries in file:", raw?.entries?.length || 0);
  if (!Array.isArray(raw?.entries) || raw.entries.length === 0) {
    throw new Error("Proofs file has no entries[]");
  }
  console.log("First entry wallet:", String(raw.entries[0].wallet));

  const onchain = await publicClient.readContract({
    address: MERKLE,
    abi: ABI,
    functionName: "rounds",
    args: [roundId],
  });

  console.log("Onchain round root:", onchain[0]);
  console.log("Claim end:", onchain[1].toString());
  console.log("Remaining USDC(6):", onchain[2].toString());

  const already = await publicClient.readContract({
    address: MERKLE,
    abi: ABI,
    functionName: "claimed",
    args: [roundId, targetWallet],
  });

  if (already) throw new Error("Already claimed for this wallet.");

  const entry = raw.entries.find(
    (e) => String(e.wallet || "").toLowerCase() === targetWallet
  );

  if (!entry) {
    console.log("❌ Wallet not found in proofs file.");
    console.log("Wallets in proofs:", raw.entries.length);
    raw.entries.forEach((e) => console.log(" -", String(e.wallet)));
    process.exit(1);
  }

  const eligibleOzWei = BigInt(String(entry.eligibleOzWei));
  const payoutUsdc6 = BigInt(String(entry.payoutUsdc6));
  const proof = entry.proof;

  console.log("Eligible OZ wei:", eligibleOzWei.toString());
  console.log("Payout USDC(6):", payoutUsdc6.toString());
  console.log("Proof len:", Array.isArray(proof) ? proof.length : 0);

  // ✅ Force gas. This avoids fragile estimate/sim gas allowance errors.
  const GAS_LIMIT = 300000n;

  // Optional: try simulate first; if it fails, still attempt with forced gas.
  try {
    await publicClient.simulateContract({
      address: MERKLE,
      abi: ABI,
      functionName: "claim",
      args: [roundId, eligibleOzWei, payoutUsdc6, proof],
      account: targetWallet,
      gas: GAS_LIMIT,
    });
  } catch (e) {
    console.warn("simulate failed (continuing with forced gas):", e?.shortMessage || e?.message || e);
  }

  const hash = await walletClient.writeContract({
    address: MERKLE,
    abi: ABI,
    functionName: "claim",
    args: [roundId, eligibleOzWei, payoutUsdc6, proof],
    gas: GAS_LIMIT,
  });

  console.log("✅ Claim tx:", hash);
}

main().catch((e) => {
  console.error("ERROR:", e?.shortMessage || e?.message || e);
  process.exit(1);
});
