import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

import NicknameRegistryRelayed from "../artifacts/contracts/NicknameRegistryRelayed.sol/NicknameRegistryRelayed.json";

// --------------------
// helpers
// --------------------
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function mustAddr(name: string, v: string): `0x${string}` {
  if (!isAddress(v)) throw new Error(`Invalid address for ${name}: ${v}`);
  return v as `0x${string}`;
}

async function mustConfirm(publicClient: any, hash: `0x${string}`) {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`TX reverted: ${hash}`);
  return r;
}

function safeReadJson(p: string) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return null;
}

function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, obj: any) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function pickRpcCandidate() {
  // Prefer explicit RPC vars; do NOT rely on VITE_* here (contracts scripts)
  // If you have both set, we'll try MAINNET first.
  const main = String(process.env.BASE_MAINNET_RPC || "").trim();
  const sep = String(process.env.BASE_SEPOLIA_RPC || "").trim();

  // Allow legacy fallback if you happened to store RPC_URL:
  const rpcUrl = String(process.env.RPC_URL || "").trim();

  // Priority:
  // 1) BASE_MAINNET_RPC
  // 2) BASE_SEPOLIA_RPC
  // 3) RPC_URL
  // 4) default sepolia public
  return main || sep || rpcUrl || "https://sepolia.base.org";
}

function resolveFileTargets(chainId: number) {
  if (chainId === base.id) {
    return {
      networkName: "base",
      chainId: base.id,
      contractsFile: "deployments.baseMainnet.json",
      publicFile: path.join("..", "public", "deployments.base.json"),
      publicFetchPath: "/deployments.base.json",
    };
  }
  if (chainId === baseSepolia.id) {
    return {
      networkName: "baseSepolia",
      chainId: baseSepolia.id,
      contractsFile: "deployments.baseSepolia.json",
      publicFile: path.join("..", "public", "deployments.baseSepolia.json"),
      publicFetchPath: "/deployments.baseSepolia.json",
    };
  }
  throw new Error(`Unsupported chainId ${chainId}. Expected 8453 (Base) or 84532 (Base Sepolia).`);
}

// --------------------
// main
// --------------------
async function main() {
  const RPC = pickRpcCandidate();

  // Start with a "neutral" client to detect chainId from the RPC
  const probeClient = createPublicClient({ transport: http(RPC, { timeout: 20_000, retryCount: 2, retryDelay: 350 }) });
  const liveChainId = await probeClient.getChainId();

  const chain = liveChainId === base.id ? base : liveChainId === baseSepolia.id ? baseSepolia : null;
  if (!chain) {
    throw new Error(`RPC returned chainId=${liveChainId}. This script only supports Base (8453) and Base Sepolia (84532).`);
  }

  const files = resolveFileTargets(liveChainId);

  const pk = mustEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(pk);

  // Contract owner = deployer unless you explicitly override OWNER_WALLET
  const owner =
    process.env.OWNER_WALLET && isAddress(process.env.OWNER_WALLET)
      ? (process.env.OWNER_WALLET as `0x${string}`)
      : (account.address as `0x${string}`);

  const nicknameRelayer = mustAddr("RELAYER_WALLET", mustEnv("RELAYER_WALLET"));

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
  });

  const walletClient = createWalletClient({
    chain,
    transport: http(RPC, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
    account,
  });

  const balWei = await publicClient.getBalance({ address: account.address });
  console.log("RPC:", RPC);
  console.log("ChainId:", liveChainId);
  console.log("Target :", `${chain.name} (expected ${chain.id})`);
  console.log("Deployer:", account.address);
  console.log("Balance :", `${formatEther(balWei)} ETH`);
  console.log("Owner   :", owner);
  console.log("Relayer :", nicknameRelayer);
  console.log("Will write:");
  console.log(" -", files.contractsFile);
  console.log(" -", files.publicFile, `(UI fetch path: ${files.publicFetchPath})`);

  // Read existing deployments for this network (if present)
  const existing = safeReadJson(files.contractsFile) || {
    network: files.networkName,
    chainId: files.chainId,
    contracts: {},
    params: {},
  };

  console.log("\n▶ Deploying NicknameRegistryRelayed...");
  const hash = await walletClient.deployContract({
    abi: NicknameRegistryRelayed.abi,
    bytecode: NicknameRegistryRelayed.bytecode as `0x${string}`,
    args: [owner, nicknameRelayer],
  });

  const rcpt = await mustConfirm(publicClient, hash);
  const NICK = rcpt.contractAddress!;
  console.log("✅ NicknameRegistryRelayed:", NICK);

  const next = {
    ...existing,
    network: files.networkName,
    chainId: files.chainId,
    rpc: RPC,
    deployer: account.address,
    contracts: {
      ...(existing.contracts || {}),
      NicknameRegistryRelayed: NICK,
    },
    params: {
      ...(existing.params || {}),
      nicknameRelayer,
      owner,
    },
  };

  console.log("\n✅ Writing deployments...");
  writeJson(files.contractsFile, next);
  console.log("✅ Wrote", files.contractsFile);

  writeJson(files.publicFile, next);
  console.log("✅ Wrote", files.publicFile, `(UI fetch path: ${files.publicFetchPath})`);

  console.log("\nDONE ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});