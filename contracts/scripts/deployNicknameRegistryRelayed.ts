import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import NicknameRegistryRelayed from "../artifacts/contracts/NicknameRegistryRelayed.sol/NicknameRegistryRelayed.json";

const FILE_CONTRACTS = "deployments.baseSepolia.json";
const FILE_PUBLIC = path.join("..", "public", "deployments.baseSepolia.json");

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

function writeDeploymentsBoth(deployments: any) {
  fs.writeFileSync(FILE_CONTRACTS, JSON.stringify(deployments, null, 2));
  console.log("✅ Wrote", FILE_CONTRACTS);

  const dir = path.dirname(FILE_PUBLIC);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(FILE_PUBLIC, JSON.stringify(deployments, null, 2));
  console.log("✅ Wrote", FILE_PUBLIC, "(UI fetch path: /deployments.baseSepolia.json)");
}

function readExistingDeployments(): any {
  try {
    if (fs.existsSync(FILE_CONTRACTS)) {
      return JSON.parse(fs.readFileSync(FILE_CONTRACTS, "utf8"));
    }
  } catch {}
  return { network: "baseSepolia", chainId: baseSepolia.id, contracts: {}, params: {} };
}

async function main() {
  const RPC =
    process.env.BASE_SEPOLIA_RPC ||
    process.env.VITE_RPC_URL ||
    "https://sepolia.base.org";

  const pk = mustEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(pk);

  const owner = mustAddr("OWNER (DEPLOYER)", account.address);
  const nicknameRelayer = mustAddr("RELAYER_WALLET", mustEnv("RELAYER_WALLET"));

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const walletClient = createWalletClient({ chain: baseSepolia, transport: http(RPC), account });

  const liveChainId = await publicClient.getChainId();
  console.log("RPC:", RPC);
  console.log("ChainId:", liveChainId);
  console.log("Deployer:", account.address);

  if (liveChainId !== baseSepolia.id) {
    throw new Error(`Wrong chainId from RPC. Expected ${baseSepolia.id}, got ${liveChainId}. Fix BASE_SEPOLIA_RPC.`);
  }

  console.log("\n▶ Deploying NicknameRegistryRelayed...");
  const hash = await walletClient.deployContract({
    abi: NicknameRegistryRelayed.abi,
    bytecode: NicknameRegistryRelayed.bytecode as `0x${string}`,
    args: [owner, nicknameRelayer],
  });

  const rcpt = await mustConfirm(publicClient, hash);
  const NICK = rcpt.contractAddress!;
  console.log("✅ NicknameRegistryRelayed:", NICK);

  const deployments = readExistingDeployments();
  const next = {
    ...deployments,
    network: "baseSepolia",
    chainId: baseSepolia.id,
    rpc: RPC,
    deployer: account.address,
    contracts: {
      ...(deployments.contracts || {}),
      NicknameRegistryRelayed: NICK,
    },
    params: {
      ...(deployments.params || {}),
      nicknameRelayer,
    },
  };

  console.log("\n✅ Writing deployments (with NicknameRegistryRelayed)...");
  writeDeploymentsBoth(next);

  console.log("\nDONE ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
