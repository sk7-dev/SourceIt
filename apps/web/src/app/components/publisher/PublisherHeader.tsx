import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Bell, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface PublisherHeaderProps {
  onPublishClick: () => void;
}

export default function PublisherHeader({ onPublishClick }: PublisherHeaderProps) {
  return (
    <header className="hidden lg:block bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 lg:py-6 sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 truncate">Welcome back, Daily Planet News</h2>
            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs sm:text-sm flex-shrink-0">
              Verified Publisher
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">
            Manage your articles, evidence, and publisher trust record
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Button onClick={onPublishClick} className="bg-blue-600 hover:bg-blue-700 hidden sm:flex">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Publish New Article</span>
          </Button>
          
          <Button onClick={onPublishClick} size="icon" className="bg-blue-600 hover:bg-blue-700 sm:hidden">
            <Plus className="w-5 h-5" />
          </Button>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </Button>

          <Avatar className="hidden sm:flex">
            <AvatarFallback className="bg-purple-100 text-purple-700">SN</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}