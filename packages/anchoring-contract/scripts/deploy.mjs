// Deploy the Anchor contract. Reads ANCHOR_RPC_URL, ANCHOR_CHAIN_ID and
// ANCHOR_SIGNER_PRIVATE_KEY from the environment (a dedicated, faucet-funded
// key), deploys artifacts/Anchor.json's bytecode, and prints the address and
// the block it landed in — set those as ANCHOR_CONTRACT_ADDRESS and
// ANCHOR_CONTRACT_DEPLOY_BLOCK for the worker.
//
//   ANCHOR_RPC_URL=https://sepolia.base.org \
//   ANCHOR_CHAIN_ID=84532 \
//   ANCHOR_SIGNER_PRIVATE_KEY=0x... \
//   pnpm --filter @sourceit/anchoring-contract deploy
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const artifact = JSON.parse(
  readFileSync(fileURLToPath(new URL("../artifacts/Anchor.json", import.meta.url)), "utf8"),
);

const rpcUrl = process.env.ANCHOR_RPC_URL;
const chainId = Number(process.env.ANCHOR_CHAIN_ID);
const key = process.env.ANCHOR_SIGNER_PRIVATE_KEY;
if (!rpcUrl || !Number.isInteger(chainId) || !key) {
  console.error("Set ANCHOR_RPC_URL, ANCHOR_CHAIN_ID and ANCHOR_SIGNER_PRIVATE_KEY.");
  process.exit(1);
}

const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const pub = createPublicClient({ chain, transport: http(rpcUrl) });

console.log(`deploying Anchor from ${account.address} on chain ${chainId} …`);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
const receipt = await pub.waitForTransactionReceipt({ hash });

console.log(JSON.stringify({
  address: receipt.contractAddress,
  deployBlock: receipt.blockNumber.toString(),
  txHash: hash,
  solcVersion: artifact.solcVersion,
  sourceSha256: artifact.sourceSha256,
}, null, 2));
