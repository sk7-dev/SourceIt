import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Bookmark, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router";

const recentArticles = [
  {
    id: 1,
    title: "Climate Summit 2026: Major Policy Announcements",
    publisher: "Global News Network",
    status: "Authentic",
    statusColor: "bg-green-100 text-green-700 border-green-200",
    credibilityScore: 94,
    lastChecked: "2 hours ago",
    saved: true,
  },
  {
    id: 2,
    title: "Tech Giants Face New AI Regulations",
    publisher: "TechDaily",
    status: "Updated",
    statusColor: "bg-blue-100 text-blue-700 border-blue-200",
    credibilityScore: 88,
    lastChecked: "5 hours ago",
    saved: false,
  },
  {
    id: 3,
    title: "Healthcare Reform Bill Passes Senate",
    publisher: "National Observer",
    status: "Authentic",
    statusColor: "bg-green-100 text-green-700 border-green-200",
    credibilityScore: 92,
    lastChecked: "1 day ago",
    saved: true,
  },
  {
    id: 4,
    title: "Economic Forecast 2026-2027",
    publisher: "Business Insider Pro",
    status: "Updated",
    statusColor: "bg-blue-100 text-blue-700 border-blue-200",
    credibilityScore: 86,
    lastChecked: "2 days ago",
    saved: false,
  },
];

export default function RecentlyVerified() {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently Verified</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentArticles.map((article) => (
            <div
              key={article.id}
              className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => navigate("/verification-result")}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 mb-2 hover:text-blue-600 transition-colors">
                    {article.title}
                  </h4>
                  <div className="flex items-center gap-3 text-sm text-slate-600 mb-3">
                    <span>{article.publisher}</span>
                    <span className="text-slate-400">•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{article.lastChecked}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`text-xs ${article.statusColor}`}>
                      {article.status === "Authentic" && <CheckCircle className="w-3 h-3 mr-1" />}
                      {article.status === "Updated" && <AlertCircle className="w-3 h-3 mr-1" />}
                      {article.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      {article.credibilityScore}% Credible
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={article.saved ? "text-blue-600 hover:text-blue-700" : "text-slate-400 hover:text-slate-600"}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Bookmark className={`w-5 h-5 ${article.saved ? "fill-current" : ""}`} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
