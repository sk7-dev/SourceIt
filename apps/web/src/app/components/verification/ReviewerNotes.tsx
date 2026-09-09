import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { MessageSquare, CheckCircle } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type Review = components["schemas"]["Review"];

const mockReviews = [
  {
    id: "mock-1",
    displayName: "Dr. Emily Chen",
    title: "Climate Science Reviewer",
    typeLabel: "Confirmation",
    comment:
      "Temperature data accurately reflects the 2025 International Climate Report. Evidence is properly cited and methodology is sound.",
    isRetracted: false,
    retractedReason: null as string | null,
  },
];

const typeLabel: Record<Review["type"], string> = {
  confirmation: "Confirmation",
  clarification: "Clarification",
  correction_note: "Correction note",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// `reviews` null → not wired yet (no articleId, or the fetch is in flight):
// fall back to the mock rows, matching EvidenceSection / VersionHistory.
export default function ReviewerNotes({ reviews }: { reviews?: Review[] | null }) {
  const rows =
    reviews == null
      ? mockReviews
      : reviews.map((r) => ({
          id: r.id,
          displayName: r.reviewer.displayName,
          title: r.reviewer.title,
          typeLabel: typeLabel[r.type],
          comment: r.comment,
          isRetracted: r.isRetracted,
          retractedReason: r.retractedReason,
        }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Reviewer Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">No reviewer has annotated this version yet.</p>
          )}
          {rows.map((review) => (
            <div key={review.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                  {initials(review.displayName)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm text-slate-900">{review.displayName}</p>
                    <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  {review.title && <p className="text-xs text-slate-600">{review.title}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-700 border-slate-200">
                  {review.typeLabel}
                </Badge>
                {review.isRetracted && (
                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                    Retracted
                  </Badge>
                )}
              </div>

              <p className="text-sm text-slate-700 leading-relaxed mb-2">{review.comment}</p>

              {review.isRetracted && review.retractedReason && (
                <p className="text-xs text-amber-700">Retraction note: {review.retractedReason}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
