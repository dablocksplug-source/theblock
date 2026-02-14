import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { MerkleTree } from "merkletreejs";
import keccak256js from "keccak256";
import {
  createPublicClient,
  http,
  isAddress,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  formatUnits,
  parseUnits,
} from "viem";
import { baseSepolia, base } from "viem/chains";

// ---------- CONFIG YOU SET ----------
const RPC_URL = process.env.RPC_URL || process.env.VITE_RPC_URL || "";
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);

// ✅ OZ token you just gave me
const OZ_TOKEN = "0xab48da141b44aeb9bc5dc3cb0ff2982f1c615830" as const;

// USDC pool for this round (6 decimals). Example: "10000" = 10,000 USDC
const POOL_USDC = process.env.REWARDS_POOL_USDC || "1000";

// Snapshot block:
// - Set it manually once you announce “snapshot at block X”
// - OR set SNAPSHOT_TAG=latest to build a draft
const SNAPSHOT_BLOCK = process.env.SNAPSHOT_BLOCK
  ? BigInt(process.env.SNAPSHOT_BLOCK)
  : null;
const SNAPSHOT_TAG = (process.env.SNAPSHOT_TAG || "").trim(); // "latest" optional

// Input wallets list (one per line)
// Put your eligible wallets here (holders, allowlist, etc.)
const INPUT_WALLETS_FILE = process.env.WALLETS_FILE || "rewards.wallets.txt";

// Output
const OUT_DIR = process.env.OUT_DIR || "rewards_out";
const ROUND_NAME = process.env.ROUND_NAME || "round-1";
// -----------------------------------

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function mustRpc() {
  if (!RPC_URL) throw new Error("Missing RPC_URL (set RPC_URL or VITE_RPC_URL)");
}
function chain() {
  return CHAIN_ID === base.id ? base : baseSepolia;
}

function readWallets(file: string): string[] {
  const raw = fs.readFileSync(file, "utf8");
  const list = raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const dedup = Array.from(new Set(list.map((a) => a.toLowerCase())));
  const ok = dedup.filter((a) => isAddress(a));
  if (ok.length === 0) throw new Error(`No valid addresses found in ${file}`);
  return ok;
}

// matches Solidity: keccak256(abi.encode(address,uint256,uint256))
function leafHash(user: `0x${string}`, eligibleOzWei: bigint, payoutUsdc6: bigint): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters("address,uint256,uint256"),
    [user, eligibleOzWei, payoutUsdc6]
  );
  return keccak256(encoded);
}

// merkletreejs wants Buffer leaves
function hexToBuf(hex: string) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

async function main() {
  mustRpc();
  if (!isAddress(OZ_TOKEN)) throw new Error("Bad OZ_TOKEN address");

  const client = createPublicClient({ chain: chain(), transport: http(RPC_URL) });

  // decide snapshot block
  let snapshotBlock: bigint;
  if (SNAPSHOT_BLOCK) snapshotBlock = SNAPSHOT_BLOCK;
  else if (SNAPSHOT_TAG === "latest") snapshotBlock = await client.getBlockNumber();
  else {
    throw new Error(
      "Set SNAPSHOT_BLOCK=<blockNumber> (recommended) or SNAPSHOT_TAG=latest (draft)."
    );
  }

  const wallets = readWallets(INPUT_WALLETS_FILE);
  console.log(`[rewards] wallets: ${wallets.length}`);
  console.log(`[rewards] snapshotBlock: ${snapshotBlock.toString()}`);
  console.log(`[rewards] OZ token: ${OZ_TOKEN}`);
  console.log(`[rewards] pool: ${POOL_USDC} USDC`);

  const poolUsdc6 = parseUnits(POOL_USDC, 6);

  // fetch balances at snapshot
  const balances: { wallet: `0x${string}`; ozWei: bigint }[] = [];
  for (const w of wallets) {
    const ozWei = await client.readContract({
      address: OZ_TOKEN,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [w as `0x${string}`],
      blockNumber: snapshotBlock,
    });
    if (ozWei > 0n) balances.push({ wallet: w as `0x${string}`, ozWei });
  }

  // total eligible OZ
  const totalOzWei = balances.reduce((acc, x) => acc + x.ozWei, 0n);
  if (totalOzWei === 0n) throw new Error("Total eligible OZ is 0 at snapshot.");

  console.log(`[rewards] eligible wallets (nonzero): ${balances.length}`);
  console.log(`[rewards] total eligible OZ: ${formatUnits(totalOzWei, 18)} OZ`);

  // compute payouts (floor division, remainder handled by "dust" staying in contract)
  const rows = balances.map((b) => {
    const payout = (poolUsdc6 * b.ozWei) / totalOzWei; // bigint
    return { ...b, payoutUsdc6: payout };
  });

  // remove zero payout entries (optional)
  const rows2 = rows.filter((r) => r.payoutUsdc6 > 0n);
  const totalPayout = rows2.reduce((acc, r) => acc + r.payoutUsdc6, 0n);
  const dust = poolUsdc6 - totalPayout;

  console.log(`[rewards] total payout: ${formatUnits(totalPayout, 6)} USDC`);
  console.log(`[rewards] dust (stays unclaimed/sweepable): ${formatUnits(dust, 6)} USDC`);
  console.log(`[rewards] entries in merkle: ${rows2.length}`);

  // build merkle
  const leavesHex = rows2.map((r) => leafHash(r.wallet, r.ozWei, r.payoutUsdc6));
  const leavesBuf = leavesHex.map(hexToBuf);

  const tree = new MerkleTree(leavesBuf, keccak256js, { sortPairs: true });
  const root = ("0x" + tree.getRoot().toString("hex")) as `0x${string}`;

  // output JSON that UI can read
  const out = {
    name: ROUND_NAME,
    chainId: CHAIN_ID,
    snapshotBlock: snapshotBlock.toString(),
    ozToken: OZ_TOKEN,
    poolUsdc6: poolUsdc6.toString(),
    totalEligibleOzWei: totalOzWei.toString(),
    totalPayoutUsdc6: totalPayout.toString(),
    dustUsdc6: dust.toString(),
    merkleRoot: root,
    // entries keyed by wallet lowercased
    entries: Object.fromEntries(
      rows2.map((r, i) => {
        const proof = tree.getHexProof(leavesBuf[i]);
        return [
          r.wallet.toLowerCase(),
          {
            wallet: r.wallet,
            eligibleOzWei: r.ozWei.toString(),
            payoutUsdc6: r.payoutUsdc6.toString(),
            proof,
          },
        ];
      })
    ),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${ROUND_NAME}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`[rewards] wrote ${outFile}`);
  console.log(`[rewards] merkleRoot: ${root}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
