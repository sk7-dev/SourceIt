import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { History, GitCompare, Eye } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type ArticleVersion = components["schemas"]["ArticleVersion"];

const mockVersions = [
  {
    version: "v2.0",
    label: "Current",
    timestamp: "April 15, 2026 at 2:30 PM",
    changeSummary: "Updated temperature figures and added new climate data from recent studies",
    isCurrent: true,
  },
  {
    version: "v1.1",
    label: "Minor correction",
    timestamp: "April 12, 2026 at 10:15 AM",
    changeSummary: "Fixed typo in section 3 and corrected author attribution",
    isCurrent: false,
  },
  {
    version: "v1.0",
    label: "Original",
    timestamp: "April 10, 2026 at 9:00 AM",
    changeSummary: "Initial publication",
    isCurrent: false,
  },
];

const changeTypeLabel: Record<string, string> = {
  original_published: "Original",
  major_update: "Major update",
  minor_correction: "Minor correction",
};

interface VersionHistoryProps {
  // Real, newest-first version list from GET /articles/{id}/versions — pass
  // `null` (the default) to keep showing the mock data, an empty/populated
  // array once real data is available (see pages/VerificationResult.tsx).
  versions?: ArticleVersion[] | null;
}

export default function VersionHistory({ versions: realVersions = null }: VersionHistoryProps) {
  const versions =
    realVersions === null
      ? mockVersions
      : realVersions.map((v, index) => ({
          version: v.versionLabel,
          label: changeTypeLabel[v.changeType] ?? v.changeType,
          timestamp: v.publishedAt ? new Date(v.publishedAt).toLocaleString() : "Not yet published",
          changeSummary: v.changeSummary ?? "Initial publication",
          isCurrent: index === 0,
        }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          Version History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {versions.map((item, index) => (
            <div
              key={item.version}
              className={`p-4 border rounded-lg ${
                item.isCurrent
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`font-mono ${
                      item.isCurrent
                        ? "bg-blue-100 text-blue-700 border-blue-200"
                        : "bg-slate-100 text-slate-700 border-slate-300"
                    }`}
                  >
                    {item.version}
                  </Badge>
                  <span className="text-sm font-semibold text-slate-900">
                    {item.label}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 mb-2">{item.timestamp}</p>
              <p className="text-sm text-slate-700 mb-3">{item.changeSummary}</p>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  View Version
                </Button>
                {!item.isCurrent && (
                  <Button variant="outline" size="sm" className="text-blue-600 border-blue-300">
                    <GitCompare className="w-4 h-4 mr-2" />
                    Compare to Current
                  </Button>
                )}
              </div>

              {/* Timeline connector */}
              {index < versions.length - 1 && (
                <div className="ml-8 mt-3 mb-0 h-6 border-l-2 border-slate-200"></div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
