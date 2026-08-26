import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Search, Bookmark, Bell, Users } from "lucide-react";

const stats = [
  {
    label: "Articles Verified",
    value: "247",
    icon: Search,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    label: "Saved Articles",
    value: "34",
    icon: Bookmark,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    label: "Updates Followed",
    value: "12",
    icon: Bell,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    label: "Publishers Followed",
    value: "8",
    icon: Users,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
];

export default function UserStats() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Verification Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="flex flex-col items-center text-center p-4 rounded-lg border border-slate-200"
              >
                <div className={`${stat.bgColor} ${stat.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">{stat.value}</div>
                <div className="text-xs text-slate-600">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}