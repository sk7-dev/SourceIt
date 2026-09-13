// The Anchor contract's ABI and deploy bytecode, for the worker's chain
// AnchorProvider and the deploy script. This module has no runtime dependency —
// `solc` / `viem` are devDependencies used only by the compile / deploy
// scripts. The ABI's static type is left loose here (it is imported JSON);
// consumers that want viem's inference cast it to `viem`'s `Abi`.
import artifact from "../artifacts/Anchor.json" with { type: "json" };

export const anchorAbi = artifact.abi;
export const anchorBytecode = artifact.bytecode as `0x${string}`;
export const anchorSolcVersion: string = artifact.solcVersion;

// The single event this contract emits, once per root.
export const ANCHORED_EVENT = "Anchored";
