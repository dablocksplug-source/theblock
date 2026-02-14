import fs from "node:fs";
import path from "node:path";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { MerkleTree } from "merkletreejs";

const SNAPSHOT_FILE = "rewards/snapshots/snapshot.round1.json";

// 50,000 USDC with 6 decimals
const POOL_USDC_6 = 50_000n * 1_000_000n;

// round outputs
const OUT_DIR = "rewards/rounds/round1";
const OUT_JSON = path.join(OUT_DIR, "round1.proofs.json");

function mustFile(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  return p;
}

function leafHash(wallet, eligibleOzWei, payoutUsdc6) {
  // must match Solidity: keccak256(abi.encode(msg.sender, eligibleOzWei, payoutUsdc))
  const encoded = encodeAbiParameters(
    parseAbiParameters("address,uint256,uint256"),
    [wallet, eligibleOzWei, payoutUsdc6]
  );
  return keccak256(encoded);
}

function main() {
  mustFile(SNAPSHOT_FILE);

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  if (!Array.isArray(snapshot)) throw new Error("snapshot file must be an array");

  const rows = snapshot
    .map((r) => {
      const wallet = String(r.wallet || "").toLowerCase();
      const ozWei = BigInt(String(r.ozWei));
      if (!wallet.startsWith("0x") || wallet.length !== 42) throw new Error(`bad wallet: ${wallet}`);
      if (ozWei <= 0n) return null;
      return { wallet, ozWei };
    })
    .filter(Boolean);

  if (rows.length === 0) throw new Error("No holders with positive balance in snapshot");

  const totalOzWei = rows.reduce((a, r) => a + r.ozWei, 0n);

  // pro-rata payouts (integer math, last wallet gets remainder so totals match exactly)
  let remaining = POOL_USDC_6;

  const payouts = rows.map((r, i) => {
    let payout = (POOL_USDC_6 * r.ozWei) / totalOzWei;
    if (i === rows.length - 1) payout = remaining;
    remaining -= payout;
    return { wallet: r.wallet, eligibleOzWei: r.ozWei, payoutUsdc6: payout };
  });

  // leaves
  const leaves = payouts.map((p) => leafHash(p.wallet, p.eligibleOzWei, p.payoutUsdc6));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  const root = tree.getHexRoot();

  const out = {
    round: 1,
    poolUsdc6: POOL_USDC_6.toString(),
    totalOzWei: totalOzWei.toString(),
    merkleRoot: root,
    entries: payouts.map((p, idx) => ({
      wallet: p.wallet,
      eligibleOzWei: p.eligibleOzWei.toString(),
      payoutUsdc6: p.payoutUsdc6.toString(),
      leaf: leaves[idx],
      proof: tree.getHexProof(leaves[idx]),
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  console.log("✅ Round1 built");
  console.log("Merkle root:", root);
  console.log("Wrote:", OUT_JSON);
  console.log("Holders:", out.entries.length);
  console.log("Pool USDC (6):", out.poolUsdc6);
}

main();
