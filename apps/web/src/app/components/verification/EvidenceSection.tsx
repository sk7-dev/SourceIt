import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FileText, Image, Video, ExternalLink } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type Evidence = components["schemas"]["Evidence"];

const mockEvidence = [
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

const fileTypeStyle: Record<Evidence["fileType"], { icon: typeof FileText; color: string; bgColor: string }> = {
  image: { icon: Image, color: "text-blue-600", bgColor: "bg-blue-50" },
  video: { icon: Video, color: "text-purple-600", bgColor: "bg-purple-50" },
  document: { icon: FileText, color: "text-red-600", bgColor: "bg-red-50" },
};

const tagLabel: Record<Evidence["tag"], string> = {
  cover_image: "Cover image",
  media: "Media",
  evidence: "Evidence",
  source: "Source",
};

// `evidence` null → not wired yet (no articleId, or the fetch is in flight):
// fall back to the mock rows, matching VersionHistory / IntegrityRecord.
export default function EvidenceSection({ evidence }: { evidence?: Evidence[] | null }) {
  const rows =
    evidence == null
      ? mockEvidence.map((m) => ({
          key: String(m.id),
          name: m.name,
          icon: m.icon,
          color: m.color,
          bgColor: m.bgColor,
          badge: m.note,
          badgeColor: m.noteColor,
          archived: false,
        }))
      : evidence.map((e) => {
          const style = fileTypeStyle[e.fileType];
          return {
            key: e.id,
            name: e.filename,
            icon: style.icon,
            color: style.color,
            bgColor: style.bgColor,
            badge: e.caption ? `${tagLabel[e.tag]} · ${e.caption}` : tagLabel[e.tag],
            badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
            archived: e.isArchivedSnapshot,
          };
        });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supporting Evidence</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">No evidence was attached to this version.</p>
          )}
          {rows.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`${item.bgColor} ${item.color} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm mb-1">{item.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${item.badgeColor}`}>
                        {item.badge}
                      </Badge>
                      {item.archived && (
                        <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">
                          Archived snapshot
                        </Badge>
                      )}
                    </div>
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
