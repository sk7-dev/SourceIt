import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { TrendingUp, TrendingDown, CheckCircle, AlertCircle, Edit } from "lucide-react";
import { Progress } from "../ui/progress";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type CredibilityBreakdown = components["schemas"]["CredibilityBreakdown"];
type CredibilityHistoryPoint = components["schemas"]["CredibilityHistoryPoint"];

// Mirrors tierFor() in apps/api/src/services/publisherDashboard.service.ts —
// only used here to name the next tier up, not to compute the score itself.
const tierThresholds: Array<{ min: number; name: string }> = [
  { min: 90, name: "Outstanding" },
  { min: 75, name: "Excellent" },
  { min: 60, name: "Good" },
  { min: 40, name: "Fair" },
  { min: 0, name: "Poor" },
];

function nextTier(score: number): { name: string; pointsAway: number } | null {
  const higher = tierThresholds.filter((t) => t.min > score).sort((a, b) => a.min - b.min);
  const target = higher[0];
  if (!target) return null;
  return { name: target.name, pointsAway: target.min - score };
}

interface CredibilityPanelProps {
  publisherId: string | null;
}

export default function CredibilityPanel({ publisherId }: CredibilityPanelProps) {
  const api = useApiClient();
  const [credibility, setCredibility] = useState<CredibilityBreakdown | null>(null);
  const [history, setHistory] = useState<CredibilityHistoryPoint[] | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}/credibility", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setCredibility(data);
    });
    api
      .GET("/publishers/{publisherId}/credibility-history", { params: { path: { publisherId } } })
      .then(({ data }) => {
        if (data) setHistory([...data.items].reverse());
      });
  }, [api, publisherId]);

  if (!publisherId || !credibility) {
    return (
      <Card className="border-purple-200 bg-purple-50/20">
        <CardHeader>
          <CardTitle>Credibility Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 py-6 text-center">
            {publisherId ? "Loading…" : "No publisher account to show credibility for."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const upcoming = nextTier(credibility.score);

  return (
    <Card className="border-purple-200 bg-purple-50/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Credibility Overview</span>
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">{credibility.tier}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Score */}
        <div className="text-center py-4">
          <div className="inline-flex items-baseline gap-2">
            <span className="text-5xl font-bold text-purple-600">{credibility.score}</span>
            <span className="text-2xl text-slate-500">/100</span>
          </div>
          {credibility.trend !== null && credibility.trend !== 0 && (
            <div className="flex items-center justify-center gap-1 mt-2">
              {credibility.trend > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${credibility.trend > 0 ? "text-green-600" : "text-red-600"}`}>
                {credibility.trend > 0 ? "+" : ""}
                {credibility.trend} since last recorded score
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={credibility.score} className="h-2" />
          {upcoming && (
            <p className="text-xs text-slate-500 text-center">
              {upcoming.pointsAway} points to reach "{upcoming.name}" tier
            </p>
          )}
        </div>

        {/* Score Breakdown */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-900 mb-3">Score Breakdown</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-slate-600">Verified articles</span>
              </div>
              <span className="text-sm font-semibold text-green-600">{credibility.factors.verifiedArticles}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-slate-600">Disputed claims</span>
              </div>
              <span className="text-sm font-semibold text-red-600">{credibility.factors.disputedClaims}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-slate-600">Transparent corrections</span>
              </div>
              <span className="text-sm font-semibold text-blue-600">
                {credibility.factors.transparentCorrections}
              </span>
            </div>
          </div>
        </div>

        {/* History Chart */}
        {history && history.length > 1 && (
          <div className="pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Score history</p>
            <div className="h-16 bg-gradient-to-r from-purple-100 via-purple-200 to-purple-100 rounded-lg flex items-end justify-around p-2 gap-1">
              {history.map((point, i) => (
                <div
                  key={i}
                  className="bg-purple-500 rounded-t w-full transition-all hover:bg-purple-600"
                  style={{ height: `${Math.max(point.score, 4)}%` }}
                  title={`${point.score}/100`}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
