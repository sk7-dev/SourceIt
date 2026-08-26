import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CheckCircle, Lightbulb } from "lucide-react";

const tips = [
  "Check if the article was updated after publication",
  "Review publisher credibility and verification status",
  "Inspect supporting evidence and media attachments",
  "View disputes or reviewer notes if available",
  "Compare versions before sharing content",
];

export default function LearningCard() {
  return (
    <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          Before You Share
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700 mb-4">
          SourceIT helps you verify news authenticity with transparent blockchain-backed records.
        </p>
        <div className="space-y-2">
          {tips.map((tip, index) => (
            <div key={index} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-700">{tip}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
