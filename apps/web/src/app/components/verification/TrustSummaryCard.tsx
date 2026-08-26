import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CheckCircle, Shield } from "lucide-react";

const trustReasons = [
  "Article exists in SourceIT registry",
  "Current version matches registered record",
  "Original and updated versions are preserved",
  "Publisher is verified",
  "3 supporting files attached",
  "1 reviewer note available",
];

export default function TrustSummaryCard() {
  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Shield className="w-6 h-6 text-blue-600" />
          Verification Result
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-sm font-semibold text-blue-900 mb-2">Status: Authentic, Updated</div>
          <p className="text-sm text-slate-700 leading-relaxed">
            This article is registered in SourceIT, currently matches version 2.0, and has transparent edit history. 
            The publisher is verified and supporting evidence is attached.
          </p>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-blue-900 mb-3">Why this result?</h4>
          <div className="space-y-2">
            {trustReasons.map((reason, index) => (
              <div key={index} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-700">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
