import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FileText, Image, Video, ExternalLink } from "lucide-react";

const evidence = [
  {
    id: 1,
    type: "PDF",
    name: "2025 International Climate Report.pdf",
    icon: FileText,
    color: "text-red-600",
    bgColor: "bg-red-50",
    note: "Added in v2.0",
    noteColor: "bg-green-100 text-green-700 border-green-200",
  },
  {
    id: 2,
    type: "Image",
    name: "Global Temperature Chart 2025.png",
    icon: Image,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    note: "Added in v2.0",
    noteColor: "bg-green-100 text-green-700 border-green-200",
  },
  {
    id: 3,
    type: "PDF",
    name: "UN Climate Summit Transcript.pdf",
    icon: FileText,
    color: "text-red-600",
    bgColor: "bg-red-50",
    note: "Original v1.0",
    noteColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    id: 4,
    type: "Video",
    name: "Summit Keynote Recording.mp4",
    icon: Video,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    note: "Reviewer referenced",
    noteColor: "bg-purple-100 text-purple-700 border-purple-200",
  },
];

export default function EvidenceSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supporting Evidence</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {evidence.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`${item.bgColor} ${item.color} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm mb-1">{item.name}</p>
                    <Badge variant="outline" className={`text-xs ${item.noteColor}`}>
                      {item.note}
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View File
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
