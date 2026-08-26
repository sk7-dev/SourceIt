import { Card, CardContent } from "../ui/card";
import { CheckCircle, AlertCircle, XCircle, HelpCircle } from "lucide-react";

const trustStatuses = [
  {
    id: "authentic",
    label: "Authentic",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    description: "Article matches the verified registry with complete history",
  },
  {
    id: "updated",
    label: "Authentic, Updated",
    icon: AlertCircle,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description: "Article was edited after publication with transparent version trail",
  },
  {
    id: "disputed",
    label: "Disputed",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    description: "Content has been flagged or disputed by reviewers or community",
  },
  {
    id: "notfound",
    label: "Not Found",
    icon: HelpCircle,
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    description: "Article not registered in SourceIT verification system",
  },
];

export default function TrustStatusCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {trustStatuses.map((status) => {
        const Icon = status.icon;
        return (
          <Card
            key={status.id}
            className={`${status.bgColor} ${status.borderColor} border-2 hover:shadow-md transition-shadow`}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className={`${status.color} mt-0.5`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-sm ${status.color} mb-1`}>
                    {status.label}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {status.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
