import { Card, CardContent } from "../ui/card";
import { FileText, CheckCircle, Clock, AlertCircle, Award } from "lucide-react";

const stats = [
  {
    label: "Total Articles Published",
    value: "24",
    icon: FileText,
    color: "blue",
  },
  {
    label: "Verified Articles",
    value: "16",
    icon: CheckCircle,
    color: "green",
  },
  {
    label: "Pending Review",
    value: "5",
    icon: Clock,
    color: "amber",
  },
  {
    label: "Disputed Articles",
    value: "3",
    icon: AlertCircle,
    color: "red",
  },
  {
    label: "Credibility Score",
    value: "84/100",
    icon: Award,
    color: "purple",
    highlight: true,
  },
];

export default function AnalyticsCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const colorClasses = {
          blue: "bg-blue-100 text-blue-600",
          green: "bg-green-100 text-green-600",
          amber: "bg-amber-100 text-amber-600",
          red: "bg-red-100 text-red-600",
          purple: "bg-purple-100 text-purple-600",
        };

        return (
          <Card
            key={stat.label}
            className={stat.highlight ? "border-purple-200 bg-purple-50/30 shadow-md" : "shadow-sm"}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className={`p-1.5 sm:p-2 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-600 line-clamp-2">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}