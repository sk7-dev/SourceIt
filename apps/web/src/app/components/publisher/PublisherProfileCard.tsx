import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Building, Calendar, Globe, Shield } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type Publisher = components["schemas"]["Publisher"];

const verificationLabel: Record<Publisher["verificationStatus"], string> = {
  unverified: "Unverified",
  pending: "Pending Verification",
  verified: "Verified",
  rejected: "Rejected",
};

const verificationColor: Record<Publisher["verificationStatus"], string> = {
  unverified: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  verified: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

interface PublisherProfileCardProps {
  publisherId: string | null;
}

export default function PublisherProfileCard({ publisherId }: PublisherProfileCardProps) {
  const api = useApiClient();
  const [publisher, setPublisher] = useState<Publisher | null>(null);

  useEffect(() => {
    if (!publisherId) return;
    api.GET("/publishers/{publisherId}", { params: { path: { publisherId } } }).then(({ data }) => {
      if (data) setPublisher(data);
    });
  }, [api, publisherId]);

  if (!publisherId || !publisher) {
    return (
      <Card className="border-blue-200 bg-blue-50/20">
        <CardHeader>
          <CardTitle className="text-lg">Publisher Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 py-6 text-center">
            {publisherId ? "Loading…" : "No publisher account yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <CardHeader>
        <CardTitle className="text-lg">Publisher Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Publisher Name */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{publisher.displayName}</h3>
            <p className="text-xs text-slate-500">{publisher.organizationName}</p>
          </div>
          <Badge className={verificationColor[publisher.verificationStatus]}>
            <Shield className="w-3 h-3 mr-1" />
            {verificationLabel[publisher.verificationStatus]}
          </Badge>
        </div>

        {/* Details */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-slate-400" />
            <a href={publisher.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              {publisher.website}
            </a>
          </div>

          {publisher.categories && publisher.categories.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Building className="w-4 h-4 text-slate-400" />
              <span>{publisher.categories.join(", ")}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              Joined{" "}
              {new Date(publisher.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Transparency Level */}
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Transparency Level</span>
            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
              {publisher.transparencyLevel}/5
            </Badge>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`h-2 flex-1 rounded ${
                  level <= publisher.transparencyLevel ? "bg-blue-500" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
