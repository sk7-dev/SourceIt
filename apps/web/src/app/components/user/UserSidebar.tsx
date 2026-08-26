import { Home, Search, Bookmark, Bell, Users, User, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface UserSidebarProps {
  activeTab?: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  isMobileOpen?: boolean;
  onMobileToggle?: () => void;
}

export default function UserSidebar({ 
  activeTab = "dashboard", 
  isCollapsed = false, 
  onToggle,
  isMobileOpen = false,
  onMobileToggle 
}: UserSidebarProps) {
  const navigate = useNavigate();

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Home, path: "/user-portal" },
    { id: "verify", label: "Verify Article", icon: Search, path: "/user-portal" },
    { id: "saved", label: "Saved Articles", icon: Bookmark, path: "/saved-articles" },
    { id: "updates", label: "Updates & Alerts", icon: Bell, path: "/user-portal" },
    { id: "publishers", label: "Trusted Publishers", icon: Users, path: "/user-portal" },
    { id: "profile", label: "Profile", icon: User, path: "/user-portal" },
    { id: "settings", label: "Settings", icon: Settings, path: "/user-portal" },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    if (onMobileToggle) {
      onMobileToggle();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:sticky top-0 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-300 z-50
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
        w-64
      `}>
        {/* Logo & Role Badge */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            {!isCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">SourceIT</h1>
              </div>
            ) : (
              <div className="flex justify-center w-full">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Search className="w-5 h-5 text-white" />
                </div>
              </div>
            )}
            
            {/* Mobile Close Button */}
            <button
              onClick={onMobileToggle}
              className="lg:hidden text-slate-600 hover:text-slate-900"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {!isCollapsed && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
              Reader
            </Badge>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span className="text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Toggle Button (Desktop Only) */}
        <div className="p-4 border-t border-slate-200">
          <Button
            variant="ghost"
            onClick={onToggle}
            className={`hidden lg:flex w-full justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 mb-2`}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </Button>
          
          {/* Logout */}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className={`w-full text-slate-600 hover:text-slate-900 hover:bg-slate-50 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm ml-3">Logout</span>}
          </Button>
        </div>
      </div>
    </>
  );
}