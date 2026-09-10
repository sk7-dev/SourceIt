import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle, UserPlus, TrendingUp } from "lucide-react";
import type { components } from "@sourceit/shared/client";

type Publisher = components["schemas"]["Publisher"];

const transparencyWord = ["", "Limited", "Fair", "Good", "Strong", "Excellent"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// `publisher` null → not wired (no articleId, or loading): fall back to the mock.
export default function PublisherCredibility({ publisher }: { publisher?: Publisher | null }) {
  const name = publisher?.displayName ?? "Global News Network";
  const verified = publisher ? publisher.verificationStatus === "verified" : true;
  const score = publisher?.credibilityScore ?? 94;
  const level = publisher?.transparencyLevel ?? 4;
  const categories = publisher?.categories ?? ["Politics", "World"];

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
              {initials(name)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{name}</h3>
                {verified && <CheckCircle className="w-4 h-4 text-blue-600" />}
              </div>
              <p className="text-xs text-slate-600">{verified ? "Verified Publisher" : "Not currently verified"}</p>
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Credibility Score</span>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                {score}%
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Transparency Level</span>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                {transparencyWord[level] ?? "Good"}
              </Badge>
            </div>
            {categories.length > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Categories</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {categories.map((c) => (
                    <span key={c} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded capitalize">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Correction / derivation note */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900 mb-1">
                  {publisher ? "How this score is derived" : "Correction History"}
                </p>
                <p className="text-xs text-green-800">
                  {publisher
                    ? "A published, auditable formula over the publisher's verified articles, transparent corrections, and open disputes."
                    : "12 articles published, 3 transparently updated, 0 disputes"}
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
