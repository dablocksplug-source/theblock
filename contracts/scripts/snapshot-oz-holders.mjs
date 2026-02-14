import fs from "fs";

const RELAYER = "https://theblock-relayer.fly.dev/feed/holders?limit=1000";

function sciToBigInt(x) {
  const s = String(x).toLowerCase();

  if (/^\d+$/.test(s)) return BigInt(s);

  const m = s.match(/^(\d+)(?:\.(\d+))?e\+?(\d+)$/);
  if (!m) throw new Error("Bad sci number: " + s);

  const intPart = m[1];
  const frac = m[2] || "";
  const exp = Number(m[3]);

  const digits = intPart + frac;
  const shift = exp - frac.length;

  if (shift < 0) throw new Error("Fractional scientific not allowed: " + s);

  return BigInt(digits + "0".repeat(shift));
}

function toBig(x) {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return sciToBigInt(x);
  if (typeof x === "string") return sciToBigInt(x);
  throw new Error("Bad oz type");
}

async function main() {
  console.log("Fetching holders from relayer...");

  const res = await fetch(RELAYER);
  const text = await res.text();

  const json = JSON.parse(text);

  const holders = json.rows.map(r => ({
    wallet: r.wallet.toLowerCase(),
    ozWei: toBig(r.oz_wei).toString()
  }));

  fs.mkdirSync("rewards/snapshots", { recursive: true });

  fs.writeFileSync(
    "rewards/snapshots/snapshot.holders.json",
    JSON.stringify(holders, null, 2)
  );

  console.log("✅ Snapshot written");
  console.log("Holder count:", holders.length);
}

main();
