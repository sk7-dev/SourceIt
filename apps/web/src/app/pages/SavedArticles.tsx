import { useState } from "react";
import { ArrowLeft, Search, Filter, Bookmark, ExternalLink, Clock, CheckCircle, AlertTriangle, XCircle, Menu } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import UserSidebar from "../components/user/UserSidebar";
import { useNavigate } from "react-router";

// Mock data for saved articles
const savedArticles = [
  {
    id: 1,
    title: "Climate Change Impact on Global Agriculture",
    publisher: "Science Daily",
    savedDate: "2024-01-15",
    status: "Verified",
    trustScore: 94,
    lastChecked: "2 hours ago",
    tags: ["Climate", "Agriculture", "Research"],
  },
  {
    id: 2,
    title: "New Breakthrough in Renewable Energy Storage",
    publisher: "Tech News Today",
    savedDate: "2024-01-14",
    status: "Updated",
    trustScore: 88,
    lastChecked: "1 day ago",
    tags: ["Technology", "Energy", "Innovation"],
  },
  {
    id: 3,
    title: "Global Economic Trends for 2024",
    publisher: "Financial Times",
    savedDate: "2024-01-13",
    status: "Disputed",
    trustScore: 72,
    lastChecked: "3 days ago",
    tags: ["Economics", "Finance", "Analysis"],
  },
  {
    id: 4,
    title: "AI Revolution in Healthcare Diagnostics",
    publisher: "Medical Journal",
    savedDate: "2024-01-12",
    status: "Verified",
    trustScore: 96,
    lastChecked: "5 hours ago",
    tags: ["Healthcare", "AI", "Technology"],
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Verified":
      return <CheckCircle className="w-4 h-4" />;
    case "Updated":
      return <Clock className="w-4 h-4" />;
    case "Disputed":
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <XCircle className="w-4 h-4" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Verified":
      return "bg-green-50 text-green-700 border-green-200";
    case "Updated":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Disputed":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    default:
      return "bg-red-50 text-red-700 border-red-200";
  }
};

export default function SavedArticles() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState("all");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const filteredArticles =
    filterStatus === "all"
      ? savedArticles
      : savedArticles.filter((article) =>
          article.status.toLowerCase().includes(filterStatus.toLowerCase())
        );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <UserSidebar 
        activeTab="saved" 
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
                <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900">Saved Articles</h2>
                <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">
                  Track and monitor your bookmarked articles
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Filters & Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input placeholder="Search saved articles..." className="pl-10" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <Button
                    variant={filterStatus === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                    className="flex-1 sm:flex-initial"
                  >
                    All
                  </Button>
                  <Button
                    variant={filterStatus === "verified" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("verified")}
                    className="flex-1 sm:flex-initial"
                  >
                    Verified
                  </Button>
                  <Button
                    variant={filterStatus === "updated" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("updated")}
                    className="flex-1 sm:flex-initial"
                  >
                    Updated
                  </Button>
                  <Button
                    variant={filterStatus === "disputed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("disputed")}
                    className="flex-1 sm:flex-initial"
                  >
                    Disputed
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Articles List */}
          <div className="space-y-4">
            {filteredArticles.map((article) => (
              <Card key={article.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-start gap-3">
                        <Bookmark className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 mb-1 break-words">
                            {article.title}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {article.publisher} • Saved {article.savedDate}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`${getStatusColor(article.status)} flex items-center gap-1 text-xs`}
                        >
                          {getStatusIcon(article.status)}
                          {article.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Trust Score: {article.trustScore}%
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Last checked: {article.lastChecked}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/verification-result")}
                        className="flex-1 sm:flex-initial"
                      >
                        <ExternalLink className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">View Details</span>
                        <span className="sm:hidden">Details</span>
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 sm:flex-initial">
                        <XCircle className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Remove</span>
                        <span className="sm:hidden">Remove</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}