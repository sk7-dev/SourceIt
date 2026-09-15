import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { MessageSquare, AlertCircle, CheckCircle } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type Review = components["schemas"]["Review"];
type Dispute = components["schemas"]["Dispute"];

function isDispute(item: Review | Dispute): item is Dispute {
  return "filedBy" in item;
}

const reviewStatusLabel: Record<Review["type"], string> = {
  confirmation: "Confirmed",
  clarification: "Clarification Needed",
  correction_note: "Correction Noted",
};

const reviewStatusColor: Record<Review["type"], string> = {
  confirmation: "bg-green-100 text-green-700 border-green-200",
  clarification: "bg-amber-100 text-amber-700 border-amber-200",
  correction_note: "bg-blue-100 text-blue-700 border-blue-200",
};

const disputeStatusLabel: Record<Dispute["status"], string> = {
  open: "Disputed",
  publisher_responded: "Response Submitted",
  withdrawn: "Withdrawn",
  resolved_corrected: "Resolved (Corrected)",
  resolved_addressed_no_verdict: "Resolved (Addressed)",
};

const disputeStatusColor: Record<Dispute["status"], string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  publisher_responded: "bg-blue-100 text-blue-700 border-blue-200",
  withdrawn: "bg-slate-100 text-slate-700 border-slate-200",
  resolved_corrected: "bg-green-100 text-green-700 border-green-200",
  resolved_addressed_no_verdict: "bg-green-100 text-green-700 border-green-200",
};

interface ReviewsDisputesProps {
  publisherId: string | null;
}

export default function ReviewsDisputes({ publisherId }: ReviewsDisputesProps) {
  const api = useApiClient();
  const [items, setItems] = useState<Array<Review | Dispute> | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}/reviews", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setItems(data.items);
    });
  }, [api, publisherId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews & Disputes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!publisherId ? (
          <p className="text-sm text-slate-500 py-6 text-center">No publisher account to show reviews for.</p>
        ) : items === null ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No reviews or disputes yet.</p>
        ) : (
          items.map((item) => {
            const dispute = isDispute(item);
            const Icon = dispute ? AlertCircle : item.type === "confirmation" ? CheckCircle : MessageSquare;
            const label = dispute ? disputeStatusLabel[item.status] : reviewStatusLabel[item.type];
            const color = dispute ? disputeStatusColor[item.status] : reviewStatusColor[item.type];
            const author = dispute ? item.filedBy.displayName : item.reviewer.displayName;
            const note = dispute ? item.reason : item.comment;

            return (
              <div
                key={item.id}
                className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-slate-900">{dispute ? "Dispute filed" : "Review"}</p>
                  <Badge variant="outline" className={`text-xs ${color}`}>
                    {label}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mb-2">
                  <span className="font-medium">{dispute ? "Filed by" : "Reviewer"}:</span> {author}
                </p>
                <div className="flex items-start gap-2 mt-2 p-2 bg-white rounded border border-slate-200">
                  <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600">{note}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
