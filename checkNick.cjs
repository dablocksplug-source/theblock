const { createPublicClient, http, isAddress } = require("viem");
const { base } = require("viem/chains");

const rpc = process.env.RPC || "https://mainnet.base.org";

const candidates = [
  "0xa9d9a1e8d71c7b64eebb873c63130ef91b5bf177",
  "0x3838e287c2e8cbaac49afdbf133752fbba53b1a3",
];

const NICK_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

(async () => {
  const pc = createPublicClient({ chain: base, transport: http(rpc) });
  const testUser = "0x000000000000000000000000000000000000dEaD";

  console.log("RPC:", rpc);

  for (const a of candidates) {
    console.log("\n---", a);
    if (!isAddress(a)) {
      console.log("not an address");
      continue;
    }

    try {
      const nonce = await pc.readContract({
        address: a,
        abi: NICK_ABI,
        functionName: "nonces",
        args: [testUser],
      });
      console.log(" nonces() works:", nonce.toString());
    } catch (e) {
      console.log(" nonces() failed:", e?.shortMessage || e?.message || String(e));
    }
  }
})();
