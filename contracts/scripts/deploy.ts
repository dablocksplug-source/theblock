import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { abi as OunceAbi, bytecode as OunceBytecode } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";
import { abi as NickAbi, bytecode as NickBytecode } from "../artifacts/contracts/NicknameRegistryRelayed.sol/NicknameRegistryRelayed.json";

const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RELAYER = "0xdc78328cB95AB30C03e9c13E2bf68e531F17A43A";

async function main() {
  if (!PK) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const account = privateKeyToAccount(PK);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  console.log("Deployer:", account.address);
/*
  const TOTAL_OZ = 72_000n;

  const ounceHash = await walletClient.deployContract({
    abi: OunceAbi,
    bytecode: OunceBytecode,
    args: [account.address, TOTAL_OZ],
  });

  const ounceReceipt = await publicClient.waitForTransactionReceipt({ hash: ounceHash });
  console.log("OunceToken:", ounceReceipt.contractAddress);
*/
  const nickHash = await walletClient.deployContract({
  abi: NickAbi,
  bytecode: NickBytecode,
  args: [account.address, RELAYER],
});

  const nickReceipt = await publicClient.waitForTransactionReceipt({ hash: nickHash });
  console.log("NicknameRegistryRelayed:", nickReceipt.contractAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
