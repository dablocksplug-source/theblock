import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

// ---------- helpers ----------
function mustEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function sanitize(v: any) {
  return String(v || "").trim().replace(/^"+|"+$/g, "");
}

function mustAddr(name: string, v: string): `0x${string}` {
  const s = sanitize(v);
  if (!isAddress(s)) throw new Error(`Invalid address for ${name}: ${v}`);
  return s as `0x${string}`;
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
  // Prefer explicit RPC vars; MAINNET first.
  const main = sanitize(process.env.BASE_MAINNET_RPC);
  const sep = sanitize(process.env.BASE_SEPOLIA_RPC);
  const rpcUrl = sanitize(process.env.RPC_URL);

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

// Base mainnet native USDC (Circle USDC on Base)
const BASE_MAINNET_USDC: `0x${string}` = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ---------- main ----------
async function main() {
  const RPC_URL = pickRpcCandidate();

  // Probe chainId from RPC
  const probe = createPublicClient({
    transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
  });
  const liveChainId = await probe.getChainId();

  const chain = liveChainId === base.id ? base : liveChainId === baseSepolia.id ? baseSepolia : null;
  if (!chain) throw new Error(`RPC returned chainId=${liveChainId}. Only Base (8453) / Base Sepolia (84532) supported.`);

  const files = resolveFileTargets(liveChainId);

  const DEPLOYER_PRIVATE_KEY = mustEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL, { timeout: 20_000, retryCount: 2, retryDelay: 350 }),
  });

  // Addresses:
  // - On mainnet, default to native USDC unless you override USDC_ADDRESS
  // - On sepolia, you MUST provide USDC_ADDRESS (MockUSDC)
  const USDC_ADDRESS =
    liveChainId === base.id
      ? mustAddr("USDC_ADDRESS (native default ok)", sanitize(process.env.USDC_ADDRESS) || BASE_MAINNET_USDC)
      : mustAddr("USDC_ADDRESS (MockUSDC)", mustEnv("USDC_ADDRESS"));

  // Treasury: allow either TREASURY_WALLET (your standard) or TREASURY_ADDRESS (your old script)
  const TREASURY_ADDRESS = mustAddr(
    "TREASURY_WALLET/TREASURY_ADDRESS",
    sanitize(process.env.TREASURY_WALLET) || sanitize(process.env.TREASURY_ADDRESS) || mustEnv("TREASURY_WALLET")
  );

  // Owner/admin of rewards contract: default deployer unless OWNER_WALLET set
  const OWNER =
    process.env.OWNER_WALLET && isAddress(sanitize(process.env.OWNER_WALLET))
      ? (sanitize(process.env.OWNER_WALLET) as `0x${string}`)
      : (account.address as `0x${string}`);

  const balWei = await publicClient.getBalance({ address: account.address });

  console.log("RPC:", RPC_URL);
  console.log("ChainId:", liveChainId);
  console.log("Target :", `${chain.name} (expected ${chain.id})`);
  console.log("Deployer:", account.address);
  console.log("Balance :", `${formatEther(balWei)} ETH`);
  console.log("Owner   :", OWNER);
  console.log("USDC    :", USDC_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("Will write:");
  console.log(" -", files.contractsFile);
  console.log(" -", files.publicFile, `(UI fetch path: ${files.publicFetchPath})`);

  // Load artifact (keep your original style)
  const artifactPath = path.resolve(
    "artifacts/contracts/BlockRewardsMerkle.sol/BlockRewardsMerkle.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode as `0x${string}`;

  // Deploy
  console.log("\n▶ Deploying BlockRewardsMerkle...");
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [OWNER, USDC_ADDRESS, TREASURY_ADDRESS],
  });

  console.log("Deploy tx:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const addr = receipt.contractAddress as `0x${string}` | undefined;
  if (!addr) throw new Error("No contractAddress in receipt");

  console.log("✅ BlockRewardsMerkle deployed at:", addr);

  // Patch deployments file (preserve existing)
  const existing = safeReadJson(files.contractsFile) || {
    network: files.networkName,
    chainId: files.chainId,
    contracts: {},
    params: {},
  };

  const next = {
    ...existing,
    network: files.networkName,
    chainId: files.chainId,
    rpc: RPC_URL,
    deployer: account.address,
    contracts: {
      ...(existing.contracts || {}),
      BlockRewardsMerkle: addr,
    },
    params: {
      ...(existing.params || {}),
      rewardsOwner: OWNER,
      rewardsUSDC: USDC_ADDRESS,
      rewardsTreasury: TREASURY_ADDRESS,
    },
  };

  console.log("\n✅ Writing deployments...");
  writeJson(files.contractsFile, next);
  console.log("✅ Wrote", files.contractsFile);

  writeJson(files.publicFile, next);
  console.log("✅ Wrote", files.publicFile, `(UI fetch path: ${files.publicFetchPath})`);

  console.log("\nDONE ✅");
}

main().catch((e: any) => {
  console.error("DEPLOY FAILED:", e?.shortMessage || e?.message || e);
  process.exit(1);
});