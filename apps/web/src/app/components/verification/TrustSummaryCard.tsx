import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CheckCircle, Shield } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type VerificationResult = components["schemas"]["VerificationResult"];
type TrustStatus = components["schemas"]["VerificationResult"]["trustStatus"];

const mockReasons = [
  "Article exists in SourceIT registry",
  "Current version matches registered record",
  "Original and updated versions are preserved",
  "Publisher is verified",
  "3 supporting files attached",
  "1 reviewer note available",
];

const statusLabel: Record<TrustStatus, string> = {
  authentic: "Authentic",
  authentic_under_review: "Authentic, Under Review",
  updated: "Authentic, Updated",
  disputed: "Disputed",
  publisher_unverified: "Publisher Unverified",
  notfound: "Not Found",
};

const statusBlurb: Record<TrustStatus, string> = {
  authentic: "This article is registered in SourceIt, its current version matches the anchored record, and its publisher is verified.",
  authentic_under_review: "This article is registered and its publisher is verified. Its current version is awaiting a reviewer's assessment.",
  updated: "This article is registered, its publisher is verified, and its current version has a transparent edit history.",
  disputed: "This article's current version has an open dispute filed by a reviewer. The dispute and any response are shown below.",
  publisher_unverified: "This article is registered, but its publisher is not currently verified.",
  notfound: "This article is not registered in SourceIt's verification system.",
};

function reasonsFor(result: VerificationResult): string[] {
  const f = result.trustSummary;
  const reasons: string[] = [];
  if (f.registryMember) reasons.push("Article exists in the SourceIt registry");
  if (f.versionMatch) reasons.push("Current version matches the registered record");
  if (result.versionHistory.length > 1) reasons.push(`${result.versionHistory.length} versions preserved with full history`);
  reasons.push(f.publisherVerified ? "Publisher is verified" : "Publisher is not currently verified");
  reasons.push(`${f.evidenceCount} supporting ${f.evidenceCount === 1 ? "file" : "files"} attached`);
  if (result.reviews.length > 0) reasons.push(`${result.reviews.length} reviewer ${result.reviews.length === 1 ? "note" : "notes"} available`);
  if (f.openDisputeCount > 0) reasons.push(`${f.openDisputeCount} open ${f.openDisputeCount === 1 ? "dispute" : "disputes"}`);
  return reasons;
}

// `result` null → not wired (no articleId, or loading): fall back to the mock.
export default function TrustSummaryCard({ result }: { result?: VerificationResult | null }) {
  const heading = result ? statusLabel[result.trustStatus] : "Authentic, Updated";
  const blurb = result
    ? statusBlurb[result.trustStatus]
    : "This article is registered in SourceIT, currently matches version 2.0, and has transparent edit history. The publisher is verified and supporting evidence is attached.";
  const reasons = result ? reasonsFor(result) : mockReasons;

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Shield className="w-6 h-6 text-blue-600" />
          Verification Result
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-sm font-semibold text-blue-900 mb-2">Status: {heading}</div>
          <p className="text-sm text-slate-700 leading-relaxed">{blurb}</p>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-blue-900 mb-3">Why this result?</h4>
          <div className="space-y-2">
            {reasons.map((reason, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-700">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
