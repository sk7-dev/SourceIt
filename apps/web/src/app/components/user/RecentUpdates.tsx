import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ArrowRight, History } from "lucide-react";

const updatedArticles = [
  {
    id: 1,
    title: "Election Results 2026: Final Count Released",
    publisher: "National News",
    oldVersion: "v1.0",
    newVersion: "v2.1",
    changeNote: "Updated final vote tallies and added electoral map",
    lastUpdated: "3 hours ago",
  },
  {
    id: 2,
    title: "COVID Variant Analysis and Vaccination Update",
    publisher: "Health Watch",
    oldVersion: "v2.3",
    newVersion: "v3.0",
    changeNote: "Revised infection rates based on new CDC data",
    lastUpdated: "1 day ago",
  },
  {
    id: 3,
    title: "Market Analysis: Q1 2026 Tech Sector Performance",
    publisher: "Financial Times",
    oldVersion: "v1.1",
    newVersion: "v1.2",
    changeNote: "Minor correction to stock price figures",
    lastUpdated: "2 days ago",
  },
];

export default function RecentUpdates() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          Articles with Recent Updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {updatedArticles.map((article) => (
            <div
              key={article.id}
              className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 mb-2">
                    {article.title}
                  </h4>
                  <p className="text-sm text-slate-600 mb-3">
                    {article.publisher}
                  </p>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-300 font-mono">
                      {article.oldVersion}
                    </Badge>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 font-mono">
                      {article.newVersion}
                    </Badge>
                    <span className="text-xs text-slate-500 ml-2">
                      {article.lastUpdated}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 italic mb-3">
                    "{article.changeNote}"
                  </p>

                  <Button variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50">
                    <History className="w-4 h-4 mr-2" />
                    Compare Changes
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
