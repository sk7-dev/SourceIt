import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Building, Calendar, Globe, Shield } from "lucide-react";

export default function PublisherProfileCard() {
  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <CardHeader>
        <CardTitle className="text-lg">Publisher Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Publisher Name */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Daily Planet News</h3>
            <p className="text-xs text-slate-500">Independent Publisher</p>
          </div>
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <Shield className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        </div>

        {/* Details */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-slate-400" />
            <a href="#" className="text-blue-600 hover:underline">
              www.sourceitnews.com
            </a>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Building className="w-4 h-4 text-slate-400" />
            <span>Politics & Technology</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Joined March 2024</span>
          </div>
        </div>

        {/* Transparency Level */}
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Transparency Level</span>
            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
              High
            </Badge>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`h-2 flex-1 rounded ${
                  level <= 4 ? "bg-blue-500" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}