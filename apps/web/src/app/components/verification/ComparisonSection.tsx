import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { GitCompare, AlertCircle } from "lucide-react";

export default function ComparisonSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-purple-600" />
          Compare Changes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-purple-600 mt-0.5" />
            <p className="text-sm text-purple-900">
              <strong>2 major changes detected:</strong> Source year updated from 2024 to 2025, 
              and temperature figures revised using newer evidence from the International Climate Panel.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Previous Version */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 font-mono text-xs">
                v1.0 - Previous
              </Badge>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-700 leading-relaxed">
                According to the <span className="bg-red-100 text-red-900 px-1 rounded">2024 climate report</span>, 
                global temperatures have risen by <span className="bg-red-100 text-red-900 px-1 rounded">1.2°C</span> since 
                pre-industrial times. Scientists warn that without immediate action, we could see an increase 
                of up to 2.5°C by 2050.
              </p>
            </div>
          </div>

          {/* Current Version */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 font-mono text-xs">
                v2.0 - Current
              </Badge>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-slate-700 leading-relaxed">
                According to the <span className="bg-green-100 text-green-900 px-1 rounded">2025 climate report</span>, 
                global temperatures have risen by <span className="bg-green-100 text-green-900 px-1 rounded">1.3°C</span> since 
                pre-industrial times. Scientists warn that without immediate action, we could see an increase 
                of up to 2.5°C by 2050.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
