import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  LayoutDashboard, 
  FileText, 
  FolderOpen, 
  MessageSquare, 
  Award, 
  User, 
  Settings, 
  LogOut,
  Shield,
  ChevronLeft,
  Menu,
  X,
  ChevronRight
} from "lucide-react";
import { cn } from "../ui/utils";

interface PublisherSidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onMobileToggle?: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "publish", label: "Publish Article", icon: FileText },
  { id: "articles", label: "My Articles", icon: FolderOpen },
  { id: "reviews", label: "Reviews & Disputes", icon: MessageSquare },
  { id: "credibility", label: "Credibility", icon: Award },
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function PublisherSidebar({ 
  activeSection, 
  setActiveSection,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onMobileToggle
}: PublisherSidebarProps) {
  const navigate = useNavigate();

  const handleNavigation = (section: string) => {
    setActiveSection(section);
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

      <div className={cn(
        "h-full bg-white border-r border-slate-200 flex flex-col shadow-sm transition-all duration-300 z-50",
        "fixed lg:sticky top-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "lg:w-20" : "lg:w-64",
        "w-64"
      )}>
        {/* Logo Section */}
        <div className="p-6 border-b border-slate-200 relative">
          <div className="flex items-center justify-between mb-2">
            {!isCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">Daily Planet</h1>
              </div>
            ) : (
              <div className="flex justify-center w-full">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="w-5 h-5 text-blue-600" />
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
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              Publisher
            </Badge>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  isCollapsed && "justify-center"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!isCollapsed && item.label}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-slate-200">
          {/* Desktop Toggle */}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              onClick={onToggleCollapse}
              className="hidden lg:flex w-full justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 mb-2"
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </Button>
          )}
          
          <Button
            variant="ghost"
            className={cn(
              "w-full text-slate-600 hover:text-red-600 hover:bg-red-50",
              isCollapsed ? "justify-center px-2" : "justify-start"
            )}
            onClick={() => navigate("/")}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </div>
    </>
  );
}