import "dotenv/config";
import express from "express";
import cors from "cors";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const PORT = Number(process.env.PORT || 8787);
const RPC = process.env.BASE_SEPOLIA_RPC;
const PK = process.env.RELAYER_PRIVATE_KEY;
const REGISTRY = process.env.NICKNAME_REGISTRY_ADDRESS;

if (!RPC) throw new Error("Missing BASE_SEPOLIA_RPC");
if (!PK) throw new Error("Missing RELAYER_PRIVATE_KEY");
if (!REGISTRY) throw new Error("Missing NICKNAME_REGISTRY_ADDRESS");
if (!isAddress(REGISTRY)) throw new Error(`Bad NICKNAME_REGISTRY_ADDRESS: ${REGISTRY}`);

const account = privateKeyToAccount(PK);

const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wc = createWalletClient({ chain: baseSepolia, transport: http(RPC), account });

/**
 * IMPORTANT:
 * Your on-chain NicknameRegistryRelayed contract MUST have a function like:
 *   setNicknameRelayed(address user, string nick, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
 *
 * If your contract uses a different name/signature, tell me the ABI and I’ll adjust this.
 */
const NICKNAME_REGISTRY_RELAYED_ABI = [
  {
    type: "function",
    name: "setNicknameRelayed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "nick", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }]
  }
];

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "256kb" }));

app.get("/health", async (_req, res) => {
  try {
    const chainId = await pc.getChainId();
    res.json({ ok: true, chainId, relayer: account.address, registry: REGISTRY });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/nickname", async (req, res) => {
  try {
    const { user, nick, deadline, v, r, s } = req.body || {};

    if (!isAddress(user)) throw new Error("Bad user address");
    const name = String(nick || "").trim();
    if (name.length < 3) throw new Error("Name too short");
    if (name.length > 24) throw new Error("Name too long");
    const dl = Number(deadline || 0);
    if (!dl || dl < Math.floor(Date.now() / 1000)) throw new Error("Expired deadline");

    // send tx as relayer
    const hash = await wc.writeContract({
      account,
      address: REGISTRY,
      abi: NICKNAME_REGISTRY_RELAYED_ABI,
      functionName: "setNicknameRelayed",
      args: [user, name, BigInt(dl), Number(v), r, s]
    });

    const receipt = await pc.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`TX reverted: ${hash}`);

    res.json({ ok: true, hash });
  } catch (e) {
    res.status(400).send(e?.message || String(e));
  }
});

app.listen(PORT, () => {
  console.log(`[relayer] listening on http://localhost:${PORT}`);
  console.log(`[relayer] relayer=${account.address}`);
  console.log(`[relayer] registry=${REGISTRY}`);
});
