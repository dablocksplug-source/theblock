import fs from "node:fs";

const input = "rewards/snapshots/holders.raw.json";
const out = "rewards/snapshots/snapshot.round1.json";

// Turn "1.08e+21" (or number 1.08e+21) into a full integer BigInt safely
function sciToBigInt(x) {
  const s = String(x).toLowerCase();

  // already plain integer string
  if (/^\d+$/.test(s)) return BigInt(s);

  // match like 1.08e+21
  const m = s.match(/^(\d+)(?:\.(\d+))?e\+?(\d+)$/);
  if (!m) throw new Error(`Bad numeric format for oz_wei: ${s}`);

  const intPart = m[1];
  const frac = m[2] || "";
  const exp = Number(m[3]);

  // digits without decimal
  const digits = intPart + frac;

  // how many zeros to append after removing decimal
  const zeros = exp - frac.length;
  if (zeros < 0) throw new Error(`oz_wei has decimals (not allowed): ${s}`);

  return BigInt(digits + "0".repeat(zeros));
}

function toBigIntStrict(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return sciToBigInt(v);
  if (typeof v === "string") return sciToBigInt(v);
  throw new Error(`Unsupported oz_wei type: ${typeof v}`);
}

const rawText = fs.readFileSync(input, "utf8").trim();
const raw = JSON.parse(rawText);

if (!raw?.ok || !Array.isArray(raw?.rows)) {
  console.error("Bad input JSON format (expected { ok:true, rows:[...] })");
  process.exit(1);
}

const snapshot = raw.rows
  .map((r) => {
    const wallet = String(r.wallet || "").toLowerCase();
    if (!wallet.startsWith("0x") || wallet.length !== 42) return null;

    const ozWei = toBigIntStrict(r.oz_wei);
    return { wallet, ozWei: ozWei.toString() };
  })
  .filter(Boolean)
  .filter((r) => BigInt(r.ozWei) > 0n);

fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
console.log("✅ Snapshot saved:", out);
console.log("Holder count:", snapshot.length);
