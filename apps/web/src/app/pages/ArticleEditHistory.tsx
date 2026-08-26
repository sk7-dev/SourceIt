import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  ArrowLeft,
  Clock,
  FileText,
  CheckCircle,
  AlertCircle,
  Shield,
  Image as ImageIcon,
  FileCheck,
  Monitor,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

export default function ArticleEditHistory() {
  const navigate = useNavigate();
  const [expandedVersion, setExpandedVersion] = useState<string | null>("v2.0");

  const versions = [
    {
      version: "v2.0",
      date: "April 15, 2026 at 2:34 PM",
      type: "Major update",
      author: "Daily Planet News",
      changes: "Updated statistics, replaced outdated image, added new evidence",
      status: "current",
    },
    {
      version: "v1.1",
      date: "April 10, 2026 at 9:12 AM",
      type: "Minor correction",
      author: "Daily Planet News",
      changes: "Fixed typo in paragraph 3, corrected citation format",
      status: "archived",
    },
    {
      version: "v1.0",
      date: "April 5, 2026 at 4:20 PM",
      type: "Original published",
      author: "Daily Planet News",
      changes: "Initial publication",
      status: "archived",
    },
  ];

  const mediaChanges = [
    {
      type: "replaced",
      icon: ImageIcon,
      label: "Hero Image Replaced",
      old: "2024-climate-data.jpg",
      new: "2026-climate-data.jpg",
      reason: "Updated with latest statistics",
    },
    {
      type: "added",
      icon: FileCheck,
      label: "New Evidence Added",
      new: "ipcc-report-2026.pdf",
      reason: "Supporting documentation",
    },
    {
      type: "added",
      icon: Monitor,
      label: "Screenshot Added",
      new: "data-visualization.png",
      reason: "Visual proof of updated metrics",
    },
  ];

  const toggleVersion = (version: string) => {
    setExpandedVersion(expandedVersion === version ? null : version);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate("/publisher-portal")}
                className="text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-slate-300" />
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-slate-700">Daily Planet</span>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">
              Article Edit History
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        {/* Article Header */}
        <Card className="border-blue-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                      v2.0
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Updated
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      <Shield className="w-3 h-3 mr-1" />
                      New Hash Recorded
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">
                    Global Climate Report: 2026 Update Shows Accelerating Trends
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Last updated April 15, 2026 at 2:34 PM
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      Daily Planet News
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informational Notice */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Transparency & Accountability
                </h3>
                <p className="text-sm text-blue-800 leading-relaxed">
                  All article versions are permanently preserved on the blockchain. Readers and
                  reviewers can compare any version, view change history, and verify the integrity
                  of each edit. Every update generates a new cryptographic hash, ensuring complete
                  transparency and preventing unauthorized alterations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Version History & Comparison */}
          <div className="lg:col-span-2 space-y-6">
            {/* Version History Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Version History Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {versions.map((version, index) => (
                    <div key={version.version}>
                      <div
                        className={`relative border rounded-lg p-4 transition-colors ${
                          version.status === "current"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {/* Timeline connector */}
                        {index < versions.length - 1 && (
                          <div className="absolute left-8 top-full h-3 w-0.5 bg-slate-300" />
                        )}

                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                version.status === "current"
                                  ? "bg-blue-600"
                                  : "bg-slate-400"
                              }`}
                            >
                              {version.status === "current" ? (
                                <CheckCircle className="w-4 h-4 text-white" />
                              ) : (
                                <div className="w-2 h-2 bg-white rounded-full" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-slate-900">
                                  {version.version}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    version.status === "current"
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                                  }
                                >
                                  {version.type}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-600 mb-1">{version.date}</p>
                              <p className="text-sm text-slate-700">{version.changes}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleVersion(version.version)}
                            className="flex-shrink-0"
                          >
                            {expandedVersion === version.version ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        {/* Expanded Content Preview */}
                        {expandedVersion === version.version && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                              Version Preview
                            </p>
                            <div className="bg-white rounded border border-slate-200 p-3 text-sm text-slate-700">
                              {version.version === "v2.0" && (
                                <>
                                  <p className="mb-2">
                                    According to the latest IPCC report released in March 2026,
                                    global temperatures have risen by{" "}
                                    <span className="bg-green-200 text-green-900 px-1 rounded">
                                      1.8°C
                                    </span>{" "}
                                    above pre-industrial levels...
                                  </p>
                                  <p className="text-xs text-slate-500 italic">
                                    Updated statistics and new evidence added
                                  </p>
                                </>
                              )}
                              {version.version === "v1.1" && (
                                <p>
                                  According to the latest IPCC report released in March 2026,
                                  global temperatures have risen by 1.5°C above pre-industrial
                                  levels...
                                </p>
                              )}
                              {version.version === "v1.0" && (
                                <p>
                                  According to the latest IPCC report released in March 2024,
                                  global temperatures have risen by 1.5°C above pre-industrial
                                  levels...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Side-by-Side Comparison */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Content Comparison: v1.1 → v2.0</CardTitle>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Major Changes Detected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* Old Version */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="text-xs">
                        v1.1 (Previous)
                      </Badge>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm space-y-3">
                      <p className="text-slate-700 leading-relaxed">
                        According to the latest IPCC report released in{" "}
                        <span className="bg-red-200 text-red-900 px-1 rounded line-through">
                          March 2024
                        </span>
                        , global temperatures have risen by{" "}
                        <span className="bg-red-200 text-red-900 px-1 rounded line-through">
                          1.5°C
                        </span>{" "}
                        above pre-industrial levels, marking a critical threshold in climate
                        science.
                      </p>
                      <p className="text-slate-700 leading-relaxed">
                        The report emphasizes the urgent need for immediate action to prevent
                        further warming and mitigate its devastating effects on ecosystems
                        worldwide.
                      </p>
                    </div>
                  </div>

                  {/* New Version */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        v2.0 (Current)
                      </Badge>
                    </div>
                    <div className="bg-white border-2 border-blue-200 rounded-lg p-4 text-sm space-y-3">
                      <p className="text-slate-700 leading-relaxed">
                        According to the latest IPCC report released in{" "}
                        <span className="bg-green-200 text-green-900 px-1 rounded font-medium">
                          March 2026
                        </span>
                        , global temperatures have risen by{" "}
                        <span className="bg-green-200 text-green-900 px-1 rounded font-medium">
                          1.8°C
                        </span>{" "}
                        above pre-industrial levels, marking a critical threshold in climate
                        science.
                      </p>
                      <p className="text-slate-700 leading-relaxed">
                        The report emphasizes the urgent need for immediate action to prevent
                        further warming and mitigate its devastating effects on ecosystems
                        worldwide.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-700">2 changes detected:</span>{" "}
                      Updated report year (2024 → 2026) and revised temperature increase (1.5°C →
                      1.8°C) based on latest scientific data.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Updated Media & Evidence */}
            <Card>
              <CardHeader>
                <CardTitle>Updated Media & Evidence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mediaChanges.map((change, index) => {
                    const Icon = change.icon;
                    return (
                      <div
                        key={index}
                        className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div
                          className={`p-2 rounded-lg flex-shrink-0 ${
                            change.type === "replaced"
                              ? "bg-amber-100"
                              : "bg-green-100"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${
                              change.type === "replaced" ? "text-amber-600" : "text-green-600"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-slate-900">{change.label}</h4>
                            <Badge
                              variant="outline"
                              className={
                                change.type === "replaced"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                  : "bg-green-50 text-green-700 border-green-200 text-xs"
                              }
                            >
                              {change.type === "replaced" ? "Replaced" : "Added"}
                            </Badge>
                          </div>
                          {change.old && (
                            <p className="text-sm text-slate-500 line-through mb-1">
                              {change.old}
                            </p>
                          )}
                          <p className="text-sm text-slate-700 font-medium mb-1">{change.new}</p>
                          <p className="text-xs text-slate-500">{change.reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Metadata */}
          <div className="space-y-6">
            {/* Change Summary */}
            <Card className="border-purple-200 bg-purple-50/20">
              <CardHeader>
                <CardTitle className="text-lg">Change Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Reason for Edit</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Updated article with the latest 2026 IPCC report data. Previous version
                    contained 2024 statistics that are now outdated. Replaced hero image and added
                    new supporting evidence.
                  </p>
                </div>
                <div className="pt-3 border-t border-purple-200">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Edit Metrics</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Lines changed</span>
                      <span className="font-medium text-slate-900">8</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Media updated</span>
                      <span className="font-medium text-slate-900">3 files</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Evidence added</span>
                      <span className="font-medium text-slate-900">2 documents</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Blockchain Integrity Record */}
            <Card className="border-blue-200 bg-blue-50/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Blockchain Integrity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Previous Hash (v1.1)
                  </p>
                  <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono break-all block">
                    0x7a8f3e9c...4d2b1a6f
                  </code>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    New Hash (v2.0)
                  </p>
                  <code className="text-xs bg-blue-100 text-blue-900 px-2 py-1 rounded font-mono break-all block font-medium">
                    0x9b2c5f1e...8a3d7c4b
                  </code>
                </div>
                <div className="pt-3 border-t border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Status</span>
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Confirmed
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Block Height:</span>
                      <span className="font-mono text-slate-900">2,845,392</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Timestamp:</span>
                      <span className="text-slate-900">Apr 15, 2026 14:34:18</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Confirmations:</span>
                      <span className="font-medium text-green-700">127</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Version Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Version Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  View Full v2.0 Article
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Shield className="w-4 h-4 mr-2" />
                  Verify on Blockchain
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <FileCheck className="w-4 h-4 mr-2" />
                  Download Change Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
