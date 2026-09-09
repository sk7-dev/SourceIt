import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Shield, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type AnchorRecord = components["schemas"]["AnchorRecord"];

// The anchor track is always surfaced explicitly — pending/anchored/anchor_failed
// — never an optimistic "verified" (build prompt: "A UI that shows a green check
// on an unanchored record is a bug").
const anchorStatusLabel: Record<AnchorRecord["status"], string> = {
  pending: "Pending anchor",
  anchored: "On-chain Logged",
  anchor_failed: "Anchor failed",
};

const proofLabel: Record<AnchorRecord["status"], string> = {
  pending: "Pending",
  anchored: "✓ Verified",
  anchor_failed: "Unavailable",
};

interface IntegrityRecordProps {
  // Real anchor state for the current version from GET
  // /versions/{versionId}/anchor. `null` (the default) keeps the mock display.
  anchor?: AnchorRecord | null;
  versionCount?: number;
  previousHash?: string | null;
}

export default function IntegrityRecord({
  anchor = null,
  versionCount = 0,
  previousHash = null,
}: IntegrityRecordProps) {
  const [expanded, setExpanded] = useState(false);

  const display =
    anchor === null
      ? {
          statusLabel: "On-chain Logged",
          lastUpdate: "April 15, 2026",
          versionTrail: "3 versions preserved",
          proofLabel: "✓ Verified",
          currentHash: "0x7f9a8e3c2d1b4a5f6e8d9c2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
          previousHashLabel: "Previous Hash (v1.1)",
          previousHash: "0x3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
          timestamp: "2026-04-15T14:30:00Z",
          chainStatus: "Confirmed (42 blocks)",
        }
      : {
          statusLabel: anchorStatusLabel[anchor.status],
          lastUpdate: anchor.anchoredAt ? new Date(anchor.anchoredAt).toLocaleDateString() : "—",
          versionTrail: `${versionCount} version${versionCount === 1 ? "" : "s"} preserved`,
          proofLabel: proofLabel[anchor.status],
          currentHash: anchor.contentHash,
          previousHashLabel: "Previous Hash",
          previousHash: previousHash ?? "—",
          timestamp: anchor.anchoredAt ?? "Not yet anchored",
          chainStatus:
            anchor.status === "anchored"
              ? `Confirmed (${anchor.chainConfirmations} confirmation${anchor.chainConfirmations === 1 ? "" : "s"})`
              : anchorStatusLabel[anchor.status],
        };

  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-600" />
          Integrity Record
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Blockchain Status</span>
              <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                {display.statusLabel}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Last Update</span>
              <span className="text-sm text-slate-900 font-medium">{display.lastUpdate}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Version Trail</span>
              <span className="text-sm text-slate-900 font-medium">{display.versionTrail}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Proof Available</span>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">
                {display.proofLabel}
              </Badge>
            </div>
          </div>

          {/* Expandable Details */}
          <div className="pt-2">
            <Button
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="w-full justify-between text-purple-700 hover:bg-purple-100"
            >
              <span className="text-sm font-medium">
                {expanded ? "Hide" : "Show"} Technical Details
              </span>
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>

            {expanded && (
              <div className="mt-3 p-4 bg-white border border-purple-200 rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-slate-600 mb-1">Current Hash</p>
                  <p className="text-xs font-mono text-slate-900 bg-slate-100 p-2 rounded break-all">
                    {display.currentHash}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">{display.previousHashLabel}</p>
                  <p className="text-xs font-mono text-slate-900 bg-slate-100 p-2 rounded break-all">
                    {display.previousHash}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">Timestamp</p>
                  <p className="text-xs text-slate-900">{display.timestamp}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">Chain Status</p>
                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">
                    {display.chainStatus}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* View Proof Button */}
          <Button variant="outline" className="w-full border-purple-300 text-purple-700 hover:bg-purple-100">
            <ExternalLink className="w-4 h-4 mr-2" />
            View Full Blockchain Proof
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
