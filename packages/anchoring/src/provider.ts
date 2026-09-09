// The blockchain, abstracted so the chain choice is reversible and testable
// with an in-memory fake (build prompt, "Third-party systems in scope"). Only a
// Merkle *root* is ever submitted — one transaction per scheduled batch, never
// one per asset.
export interface AnchorSubmission {
  // The Merkle root to anchor, 64-char lowercase hex.
  merkleRoot: string;
}

export interface AnchorReceipt {
  // Opaque chain transaction identifier.
  chainTxHash: string;
  // Block the anchoring transaction was included in.
  blockHeight: number;
  // Confirmations observed so far. The worker treats the root as anchored once
  // this reaches its configured threshold.
  confirmations: number;
}

export interface AnchorProvider {
  // Submit a Merkle root for anchoring. MUST be idempotent on `merkleRoot`:
  // submitting the same root again returns the same transaction, never a second
  // one. The worker relies on this to safely retry a batch whose process
  // crashed after submitting but before recording the result.
  submit(submission: AnchorSubmission): Promise<AnchorReceipt>;

  // The current chain status of a previously-submitted root. Throws if the root
  // was never submitted through this provider.
  getReceipt(merkleRoot: string): Promise<AnchorReceipt>;
}
