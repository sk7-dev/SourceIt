// Compile contracts/Anchor.sol with solc-js and write artifacts/Anchor.json
// (abi + bytecode + solc version + a hash of the source). The artifact is
// committed so nothing downstream — the worker, CI — needs a Solidity
// toolchain; run `pnpm --filter @sourceit/anchoring-contract build` to
// regenerate it after editing the contract.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solc from "solc";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SOURCE_PATH = "../contracts/Anchor.sol";
const source = readFileSync(here(SOURCE_PATH), "utf8");

const input = {
  language: "Solidity",
  sources: { "Anchor.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const fatal = (out.errors ?? []).filter((e) => e.severity === "error");
if (fatal.length) {
  for (const e of fatal) console.error(e.formattedMessage);
  process.exit(1);
}

const contract = out.contracts["Anchor.sol"].Anchor;
const artifact = {
  contractName: "Anchor",
  solcVersion: solc.version(),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

mkdirSync(here("../artifacts"), { recursive: true });
writeFileSync(here("../artifacts/Anchor.json"), JSON.stringify(artifact, null, 2) + "\n");
console.log(`wrote artifacts/Anchor.json  (solc ${artifact.solcVersion})`);
