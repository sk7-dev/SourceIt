import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { TrendingUp, CheckCircle, AlertCircle, Edit } from "lucide-react";
import { Progress } from "../ui/progress";

const scoreBreakdown = [
  {
    label: "Verified articles",
    value: "+10",
    icon: CheckCircle,
    color: "text-green-600",
  },
  {
    label: "Disputed claims",
    value: "-4",
    icon: AlertCircle,
    color: "text-red-600",
  },
  {
    label: "Transparent corrections",
    value: "+3",
    icon: Edit,
    color: "text-blue-600",
  },
];

export default function CredibilityPanel() {
  return (
    <Card className="border-purple-200 bg-purple-50/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Credibility Overview</span>
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
            Excellent
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Score */}
        <div className="text-center py-4">
          <div className="inline-flex items-baseline gap-2">
            <span className="text-5xl font-bold text-purple-600">84</span>
            <span className="text-2xl text-slate-500">/100</span>
          </div>
          <div className="flex items-center justify-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-600 font-medium">+5 this month</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={84} className="h-2" />
          <p className="text-xs text-slate-500 text-center">
            16 points to reach "Outstanding" tier
          </p>
        </div>

        {/* Score Breakdown */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-900 mb-3">Score Breakdown</p>
          <div className="space-y-3">
            {scoreBreakdown.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-sm text-slate-600">{item.label}</span>
                  </div>
                  <span className={`text-sm font-semibold ${item.color}`}>
                    {item.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mini Chart Placeholder */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-2">Last 30 days trend</p>
          <div className="h-16 bg-gradient-to-r from-purple-100 via-purple-200 to-purple-100 rounded-lg flex items-end justify-around p-2 gap-1">
            {[65, 70, 68, 72, 75, 78, 80, 82, 84].map((height, i) => (
              <div
                key={i}
                className="bg-purple-500 rounded-t w-full transition-all hover:bg-purple-600"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
