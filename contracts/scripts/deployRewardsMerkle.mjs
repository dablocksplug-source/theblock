import fs from "node:fs";
import path from "node:path";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

function mustEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const RPC_URL = mustEnv("RPC_URL");
const DEPLOYER_PRIVATE_KEY = mustEnv("DEPLOYER_PRIVATE_KEY"); // 0x...
const USDC_ADDRESS = mustEnv("USDC_ADDRESS"); // MockUSDC on baseSepolia
const TREASURY_ADDRESS = mustEnv("TREASURY_ADDRESS"); // where sweep goes

const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const artifactPath = path.resolve(
  "artifacts/contracts/BlockRewardsMerkle.sol/BlockRewardsMerkle.json"
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = artifact.abi;
const bytecode = artifact.bytecode;

async function main() {
  console.log("Deployer:", account.address);
  console.log("USDC:", USDC_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [account.address, USDC_ADDRESS, TREASURY_ADDRESS],
  });

  console.log("Deploy tx:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const addr = receipt.contractAddress;

  if (!addr) throw new Error("No contractAddress in receipt");
  console.log("✅ BlockRewardsMerkle deployed at:", addr);

  // Patch deployments file
  const depFile = "deployments.baseSepolia.json";
  const dep = JSON.parse(fs.readFileSync(depFile, "utf8"));

  dep.contracts = dep.contracts || {};
  dep.contracts.BlockRewardsMerkle = addr;

  fs.writeFileSync(depFile, JSON.stringify(dep, null, 2));
  console.log("✅ Wrote into", depFile, "contracts.BlockRewardsMerkle");
}

main().catch((e) => {
  console.error("DEPLOY FAILED:", e?.message || e);
  process.exit(1);
});
