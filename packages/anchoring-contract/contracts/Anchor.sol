// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SourceIt Merkle anchor registry
/// @notice One transaction per scheduled batch writes that batch's Merkle root
///         on-chain. The root is the only thing anchored — never a per-version
///         hash. A skeptical third party recomputes an inclusion proof offline
///         (see docs/ANCHORING.md) and checks the resulting root against an
///         `Anchored` event emitted by this contract, without trusting
///         SourceIt's database.
/// @dev    `anchor` reverts on a repeat so the off-chain `AnchorProvider.submit`
///         contract — "idempotent on merkleRoot, never a second transaction" —
///         holds even under a race between two worker instances. The provider
///         checks for an existing `Anchored` log before sending, and on the
///         `AlreadyAnchored` revert falls back to reading that log.
contract Anchor {
    error AlreadyAnchored(bytes32 root);

    /// @notice Set once, when a root is first anchored.
    mapping(bytes32 => bool) public anchored;

    /// @notice Emitted once per root. `root` is indexed so a provider with no
    ///         local memory (e.g. after a crash) can find the anchoring
    ///         transaction by filtering on the root topic alone.
    event Anchored(bytes32 indexed root, address indexed sender, uint256 blockNumber);

    function anchor(bytes32 root) external {
        if (anchored[root]) revert AlreadyAnchored(root);
        anchored[root] = true;
        emit Anchored(root, msg.sender, block.number);
    }
}
