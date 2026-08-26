import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { MessageSquare, CheckCircle } from "lucide-react";

const reviews = [
  {
    id: 1,
    reviewer: "Dr. Emily Chen",
    role: "Climate Science Reviewer",
    status: "Verified",
    statusColor: "bg-green-100 text-green-700 border-green-200",
    comment: "Temperature data accurately reflects the 2025 International Climate Report. Evidence is properly cited and methodology is sound.",
    timestamp: "April 16, 2026",
  },
];

export default function ReviewerNotes() {
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
          {reviews.map((review) => (
            <div key={review.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                  EC
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm text-slate-900">{review.reviewer}</p>
                    <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <p className="text-xs text-slate-600">{review.role}</p>
                </div>
              </div>

              <Badge variant="outline" className={`text-xs ${review.statusColor} mb-3`}>
                {review.status}
              </Badge>

              <p className="text-sm text-slate-700 leading-relaxed mb-2">
                {review.comment}
              </p>

              <p className="text-xs text-slate-500">{review.timestamp}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
