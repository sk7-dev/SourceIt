import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { MessageSquare, AlertCircle, CheckCircle } from "lucide-react";

const reviews = [
  {
    id: 1,
    article: "Climate Change Impact",
    reviewer: "Dr. Sarah Chen",
    status: "Clarification Needed",
    note: "Please provide additional data sources for coastal erosion claims.",
    type: "clarification",
  },
  {
    id: 2,
    article: "Healthcare Reform",
    reviewer: "Prof. Michael Torres",
    status: "Disputed",
    note: "Statistics on page 3 need verification.",
    type: "dispute",
  },
  {
    id: 3,
    article: "Election Report 2026",
    reviewer: "Emily Richardson",
    status: "Approved",
    note: "Excellent sourcing and balanced coverage.",
    type: "approved",
  },
];

const getStatusColor = (type: string) => {
  switch (type) {
    case "approved":
      return "bg-green-100 text-green-700 border-green-200";
    case "clarification":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "dispute":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getIcon = (type: string) => {
  switch (type) {
    case "approved":
      return CheckCircle;
    case "dispute":
      return AlertCircle;
    default:
      return MessageSquare;
  }
};

export default function ReviewsDisputes() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews & Disputes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviews.map((review) => {
          const Icon = getIcon(review.type);
          return (
            <div
              key={review.id}
              className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-medium text-slate-900">{review.article}</p>
                <Badge variant="outline" className={`text-xs ${getStatusColor(review.type)}`}>
                  {review.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mb-2">
                <span className="font-medium">Reviewer:</span> {review.reviewer}
              </p>
              <div className="flex items-start gap-2 mt-2 p-2 bg-white rounded border border-slate-200">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">{review.note}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
