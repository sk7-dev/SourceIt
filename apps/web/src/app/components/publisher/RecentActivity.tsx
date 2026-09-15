import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { FileText, CheckCircle, MessageSquare, Edit, AlertCircle, ShieldAlert, EyeOff } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type ActivityEvent = components["schemas"]["ActivityEvent"];

const iconByType: Record<ActivityEvent["type"], typeof FileText> = {
  publish: FileText,
  blockchain: CheckCircle,
  review: MessageSquare,
  update: Edit,
  correction: AlertCircle,
  dispute_filed: ShieldAlert,
  redaction: EyeOff,
};

const colorByType: Record<ActivityEvent["type"], string> = {
  publish: "bg-blue-100 text-blue-600",
  blockchain: "bg-green-100 text-green-600",
  review: "bg-amber-100 text-amber-600",
  update: "bg-purple-100 text-purple-600",
  correction: "bg-red-100 text-red-600",
  dispute_filed: "bg-red-100 text-red-600",
  redaction: "bg-slate-200 text-slate-600",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

interface RecentActivityProps {
  publisherId: string | null;
}

export default function RecentActivity({ publisherId }: RecentActivityProps) {
  const api = useApiClient();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}/activity", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setEvents(data.items);
    });
  }, [api, publisherId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {!publisherId ? (
          <p className="text-sm text-slate-500 py-6 text-center">No publisher account to show activity for.</p>
        ) : events === null ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No activity yet.</p>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => {
              const Icon = iconByType[event.type];
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${colorByType[event.type]} flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{event.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatRelativeTime(event.createdAt)}</p>
                  </div>
                  {index < events.length - 1 && (
                    <div className="absolute left-[1.875rem] mt-10 h-6 w-px bg-slate-200" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
