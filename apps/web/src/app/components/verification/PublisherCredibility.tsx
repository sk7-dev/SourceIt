import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle, UserPlus, TrendingUp } from "lucide-react";

export default function PublisherCredibility() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Publisher Credibility</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Publisher Info */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              GN
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">Global News Network</h3>
                <CheckCircle className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs text-slate-600">Verified Publisher</p>
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Credibility Score</span>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                94%
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Transparency Level</span>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                Excellent
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Categories</span>
              <div className="flex gap-1">
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">Politics</span>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">World</span>
              </div>
            </div>
          </div>

          {/* Correction History */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900 mb-1">Correction History</p>
                <p className="text-xs text-green-800">
                  12 articles published, 3 transparently updated, 0 disputes
                </p>
              </div>
            </div>
          </div>

          {/* Follow Button */}
          <Button className="w-full bg-blue-600 hover:bg-blue-700">
            <UserPlus className="w-4 h-4 mr-2" />
            Follow Publisher
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
