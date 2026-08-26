import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { FileText, CheckCircle, MessageSquare, Edit, AlertCircle } from "lucide-react";

const activities = [
  {
    id: 1,
    type: "publish",
    title: 'Article "Election Report 2026" published',
    time: "2 hours ago",
    icon: FileText,
    color: "blue",
  },
  {
    id: 2,
    type: "blockchain",
    title: "Hash recorded on-chain for latest article",
    time: "2 hours ago",
    icon: CheckCircle,
    color: "green",
  },
  {
    id: 3,
    type: "review",
    title: "Reviewer requested clarification on Climate article",
    time: "5 hours ago",
    icon: MessageSquare,
    color: "amber",
  },
  {
    id: 4,
    type: "update",
    title: 'Article "Healthcare Reform" updated to Version 2',
    time: "1 day ago",
    icon: Edit,
    color: "purple",
  },
  {
    id: 5,
    type: "correction",
    title: "Correction added to health article",
    time: "2 days ago",
    icon: AlertCircle,
    color: "red",
  },
];

const getColorClasses = (color: string) => {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
  };
  return colors[color as keyof typeof colors] || colors.blue;
};

export default function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const Icon = activity.icon;
            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${getColorClasses(activity.color)} flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{activity.time}</p>
                </div>
                {index < activities.length - 1 && (
                  <div className="absolute left-[1.875rem] mt-10 h-6 w-px bg-slate-200" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
