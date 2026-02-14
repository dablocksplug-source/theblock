// rewards/round1/buildMerkle.round1.mjs
import fs from "node:fs";
import path from "node:path";
import { keccak256, encodeAbiParameters, parseAbiParameters, isAddress } from "viem";

const SNAPSHOT_PATH = "rewards/snapshots/snapshot.round1.json";

// 50,000 USDC with 6 decimals
const POOL_USDC_6 = 50000n * 1_000_000n;

// Claim window (clever default): 60 days
const CLAIM_WINDOW_DAYS = 60;

// Output folder
const OUT_DIR = "rewards/round1";

// -------- helpers --------
function nowSec() {
  return BigInt(Math.floor(Date.now() / 1000));
}

// Leaf must match Solidity: keccak256(abi.encode(msg.sender, eligibleOzWei, payoutUsdc))
function leaf(wallet, eligibleOzWei, payoutUsdc) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address,uint256,uint256"),
      [wallet, eligibleOzWei, payoutUsdc]
    )
  );
}

// Convert leaf hex -> Buffer for tree ops
function hexToBuf(hex) {
  return Buffer.from(hex.slice(2), "hex");
}

function bufToHex(buf) {
  return "0x" + buf.toString("hex");
}

// Minimal Merkle tree (sorted pairs) without extra deps
function merkleRoot(leavesHex) {
  if (leavesHex.length === 0) return "0x" + "00".repeat(32);

  let level = leavesHex.map(hexToBuf);

  const hashPair = (a, b) => {
    // sort pairs
    const [x, y] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
    return hexToBuf(keccak256(Buffer.concat([x, y])));
  };

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || level[i]; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return bufToHex(level[0]);
}

function merkleProof(leavesHex, index) {
  // build levels
  let level = leavesHex.map(hexToBuf);

  const hashPair = (a, b) => {
    const [x, y] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
    return hexToBuf(keccak256(Buffer.concat([x, y])));
  };

  const proof = [];
  let idx = index;

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || level[i];
      next.push(hashPair(left, right));
    }

    const pairIndex = idx ^ 1; // sibling
    if (pairIndex < level.length) {
      proof.push(bufToHex(level[pairIndex]));
    } else {
      // if sibling doesn't exist (odd), sibling is itself
      proof.push(bufToHex(level[idx]));
    }

    idx = Math.floor(idx / 2);
    level = next;
  }

  return proof;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// -------- main --------
function main() {
  ensureDir(OUT_DIR);

  const snapRaw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  if (!Array.isArray(snapRaw)) {
    console.error("Snapshot file must be an array: [{ wallet, ozWei }, ...]");
    process.exit(1);
  }

  const holders = snapRaw
    .map((r) => {
      const wallet = String(r.wallet || "").toLowerCase();
      const ozWeiStr = String(r.ozWei ?? "");
      if (!isAddress(wallet)) throw new Error(`Bad wallet: ${wallet}`);
      const ozWei = BigInt(ozWeiStr);
      return { wallet, ozWei };
    })
    .filter((h) => h.ozWei > 0n);

  if (holders.length === 0) {
    console.error("No holders in snapshot.");
    process.exit(1);
  }

  // total oz
  const totalOzWei = holders.reduce((a, h) => a + h.ozWei, 0n);

  // base payouts (floor)
  let allocated = 0n;
  const rows = holders.map((h) => {
    const exactNum = POOL_USDC_6 * h.ozWei;
    const payout = exactNum / totalOzWei;        // floor
    const rem = exactNum % totalOzWei;           // remainder used to distribute dust fairly
    allocated += payout;
    return { ...h, payoutUsdc6: payout, remainder: rem };
  });

  // distribute dust (POOL - allocated) one microUSDC at a time to highest remainders
  let dust = POOL_USDC_6 - allocated;
  rows.sort((a, b) => (a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0));

  let i = 0;
  while (dust > 0n) {
    rows[i].payoutUsdc6 += 1n;
    dust -= 1n;
    i += 1;
    if (i >= rows.length) i = 0;
  }

  // restore deterministic order (wallet asc) for stable proofs
  rows.sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));

  // leaves
  const leaves = rows.map((r) => leaf(r.wallet, r.ozWei, r.payoutUsdc6));
  const root = merkleRoot(leaves);

  const claimEnd = Number(nowSec() + BigInt(CLAIM_WINDOW_DAYS) * 86400n);

  // build per-wallet proofs
  const claims = rows.map((r, idx) => ({
    wallet: r.wallet,
    eligibleOzWei: r.ozWei.toString(),
    payoutUsdc6: r.payoutUsdc6.toString(),
    proof: merkleProof(leaves, idx),
  }));

  // sanity: payout sum
  const sumPayout = rows.reduce((a, r) => a + r.payoutUsdc6, 0n);

  const out = {
    roundName: "round1",
    snapshotFile: SNAPSHOT_PATH,
    poolUsdc6: POOL_USDC_6.toString(),
    totalOzWei: totalOzWei.toString(),
    claimWindowDays: CLAIM_WINDOW_DAYS,
    claimEnd,
    merkleRoot: root,
    claims,
  };

  fs.writeFileSync(path.join(OUT_DIR, "merkle.round1.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "root.round1.txt"), root + "\n");

  // simple CSV for your eyeballs
  const csv = ["wallet,eligibleOzWei,payoutUsdc6"].concat(
    rows.map((r) => `${r.wallet},${r.ozWei.toString()},${r.payoutUsdc6.toString()}`)
  );
  fs.writeFileSync(path.join(OUT_DIR, "claims.round1.csv"), csv.join("\n"));

  console.log("✅ Built Merkle round1");
  console.log("Root:", root);
  console.log("Claim end (unix):", claimEnd);
  console.log("Holders:", rows.length);
  console.log("Pool USDC(6):", POOL_USDC_6.toString(), "sum payouts:", sumPayout.toString());
}

main();
