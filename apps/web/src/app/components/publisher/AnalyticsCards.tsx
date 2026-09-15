import { useEffect, useState } from "react";
import { Card, CardContent } from "../ui/card";
import { FileText, CheckCircle, Clock, AlertCircle, Award } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type PublisherAnalytics = components["schemas"]["PublisherAnalytics"];

interface AnalyticsCardsProps {
  publisherId: string | null;
}

export default function AnalyticsCards({ publisherId }: AnalyticsCardsProps) {
  const api = useApiClient();
  const [analytics, setAnalytics] = useState<PublisherAnalytics | null>(null);
  const [credibilityScore, setCredibilityScore] = useState<number | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}/analytics", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setAnalytics(data);
    });
    api.GET("/publishers/{publisherId}", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setCredibilityScore(data.credibilityScore);
    });
  }, [api, publisherId]);

  const stats = [
    {
      label: "Total Articles Published",
      value: analytics ? String(analytics.totalArticlesPublished) : "—",
      icon: FileText,
      color: "blue",
    },
    {
      label: "Verified Articles",
      value: analytics ? String(analytics.verifiedArticleCount) : "—",
      icon: CheckCircle,
      color: "green",
    },
    {
      label: "Pending Review",
      value: analytics ? String(analytics.pendingReviewCount) : "—",
      icon: Clock,
      color: "amber",
    },
    {
      label: "Disputed Articles",
      value: analytics ? String(analytics.disputedArticleCount) : "—",
      icon: AlertCircle,
      color: "red",
    },
    {
      label: "Credibility Score",
      value: credibilityScore !== null ? `${credibilityScore}/100` : "—",
      icon: Award,
      color: "purple",
      highlight: true,
    },
  ];

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
