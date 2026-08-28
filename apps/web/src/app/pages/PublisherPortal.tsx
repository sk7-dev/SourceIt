import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "../components/ui/button";
import PublisherSidebar from "../components/publisher/PublisherSidebar";
import PublisherHeader from "../components/publisher/PublisherHeader";
import AnalyticsCards from "../components/publisher/AnalyticsCards";
import PublishArticlePanel from "../components/publisher/PublishArticlePanel";
import MyArticlesTable from "../components/publisher/MyArticlesTable";
import RecentActivity from "../components/publisher/RecentActivity";
import CredibilityPanel from "../components/publisher/CredibilityPanel";
import ReviewsDisputes from "../components/publisher/ReviewsDisputes";
import PublisherProfileCard from "../components/publisher/PublisherProfileCard";
import { useApiClient } from "../lib/apiClient";

export default function PublisherPortal() {
  const api = useApiClient();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    api.GET("/me").then(({ data, error }) => {
      if (error || !data) {
        setMeError("Signed in, but no SourceIt account exists for this session yet");
        return;
      }
      if (data.publisherIds.length === 0) {
        setMeError("This account isn't a member of any publisher yet");
        return;
      }
      setPublisherId(data.publisherIds[0]);
    });
  }, [api]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 flex">
      {/* Sidebar */}
      <PublisherSidebar 
        activeSection={activeSection} 
        setActiveSection={setActiveSection}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:w-auto">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </Button>
            <h1 className="text-lg font-bold text-slate-900">Daily Planet</h1>
            <div className="w-10"></div>
          </div>
        </div>
        
        {/* Header */}
        <PublisherHeader onPublishClick={() => setShowPublishForm(true)} />

        {/* Dashboard Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Analytics Cards */}
          <AnalyticsCards />

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {meError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {meError}
                </div>
              )}

              {/* Publish Article Panel */}
              {!showPublishForm && (
                <PublishArticlePanel onStartClick={() => setShowPublishForm(true)} />
              )}

              {/* Article Submission Form */}
              {showPublishForm && publisherId && (
                <PublishArticlePanel
                  showForm={true}
                  publisherId={publisherId}
                  onCancel={() => setShowPublishForm(false)}
                  onPublished={() => setShowPublishForm(false)}
                />
              )}

              {/* My Articles Table */}
              <MyArticlesTable publisherId={publisherId} />

              {/* Recent Activity */}
              <RecentActivity />
            </div>

            {/* Right Column - Sidebar Content */}
            <div className="space-y-6">
              {/* Publisher Profile Card */}
              <PublisherProfileCard />

              {/* Credibility Panel */}
              <CredibilityPanel />

              {/* Reviews & Disputes */}
              <ReviewsDisputes />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}