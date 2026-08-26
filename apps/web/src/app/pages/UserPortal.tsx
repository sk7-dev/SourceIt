import { useState } from "react";
import { Bell, Menu } from "lucide-react";
import { Button } from "../components/ui/button";
import UserSidebar from "../components/user/UserSidebar";
import VerificationHero from "../components/user/VerificationHero";
import TrustStatusCards from "../components/user/TrustStatusCards";
import RecentlyVerified from "../components/user/RecentlyVerified";
import RecentUpdates from "../components/user/RecentUpdates";
import TrustedPublishers from "../components/user/TrustedPublishers";
import UserStats from "../components/user/UserStats";
import LearningCard from "../components/user/LearningCard";
import { useNavigate } from "react-router";

export default function UserPortal() {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <UserSidebar 
        activeTab="dashboard" 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:w-auto">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden"
              >
                <Menu className="w-6 h-6" />
              </Button>
              
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">User Dashboard</h2>
                <p className="text-xs sm:text-sm text-slate-600">Verify articles and track credibility</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Verification Hero */}
          <VerificationHero />

          {/* Trust Status Cards */}
          <TrustStatusCards />

          {/* Stats & Learning - Responsive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <UserStats />
            </div>
            <div>
              <LearningCard />
            </div>
          </div>

          {/* Recently Verified & Updates - Responsive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentlyVerified />
            <RecentUpdates />
          </div>

          {/* Trusted Publishers */}
          <TrustedPublishers />
        </main>
      </div>
    </div>
  );
}