import { useEffect, useState } from "react";
import { ArrowLeft, Bookmark, Share2, AlertCircle, CheckCircle, Menu } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import UserSidebar from "../components/user/UserSidebar";
import TrustSummaryCard from "../components/verification/TrustSummaryCard";
import VersionHistory from "../components/verification/VersionHistory";
import ComparisonSection from "../components/verification/ComparisonSection";
import EvidenceSection from "../components/verification/EvidenceSection";
import PublisherCredibility from "../components/verification/PublisherCredibility";
import ReviewerNotes from "../components/verification/ReviewerNotes";
import IntegrityRecord from "../components/verification/IntegrityRecord";
import { useNavigate, useParams } from "react-router";
import { publicApiClient } from "../lib/apiClient";
import type { components } from "@sourceit/shared/client";

type ArticleVersion = components["schemas"]["ArticleVersion"];

// Only wired for the sub-parts the backend can actually back so far (the
// article itself and its public version history — GET /articles/{id} and
// GET /articles/{id}/versions). TrustSummaryCard, PublisherCredibility,
// EvidenceSection, ReviewerNotes, and IntegrityRecord all need the composed
// GET /articles/{id}/verification endpoint, which doesn't exist yet (it needs
// Evidence, Review, and Dispute data — see docs/PROJECT_STATE.md) — they stay
// on mock data until that endpoint exists, whether or not an articleId is
// present in the URL.
export default function VerificationResult() {
  const navigate = useNavigate();
  const { articleId } = useParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [versions, setVersions] = useState<ArticleVersion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!articleId) return;
    setLoadError(null);
    setVersions(null);

    publicApiClient
      .GET("/articles/{articleId}", { params: { path: { articleId } } })
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError("This article is not registered in SourceIt's verification system");
        }
      });

    publicApiClient
      .GET("/articles/{articleId}/versions", { params: { path: { articleId } } })
      .then(({ data }) => {
        if (data) setVersions(data.items);
      });
  }, [articleId]);

  const currentVersion = versions?.[0] ?? null;
  const subtitle = articleId
    ? loadError ?? currentVersion?.headline ?? "Loading…"
    : "Climate Change Impact on Global Agriculture";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <UserSidebar 
        activeTab="verify" 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:w-auto">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden flex-shrink-0"
              >
                <Menu className="w-6 h-6" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/user-portal")}
                className="flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 truncate">
                  Verification Result
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 truncate">
                  {subtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Bookmark className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Share2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              {/* Mobile action buttons */}
              <Button variant="outline" size="sm" className="sm:hidden">
                <Bookmark className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="sm:hidden">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {articleId && loadError ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-slate-900 font-medium">{loadError}</p>
            </div>
          ) : (
            <>
              {/* Trust Summary */}
              <TrustSummaryCard />

              {/* Publisher Credibility & Evidence - Responsive Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PublisherCredibility />
                <EvidenceSection />
              </div>

              {/* Version History */}
              <VersionHistory versions={articleId ? (versions ?? []) : null} />

              {/* Comparison Section */}
              <ComparisonSection />

              {/* Reviewer Notes */}
              <ReviewerNotes />

              {/* Blockchain Integrity Record */}
              <IntegrityRecord />
            </>
          )}
        </main>
      </div>
    </div>
  );
}