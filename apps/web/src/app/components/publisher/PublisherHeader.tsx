import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Bell, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import type { components } from "@sourceit/shared/client";

type VerificationStatus = components["schemas"]["Publisher"]["verificationStatus"];

const verificationLabel: Record<VerificationStatus, string> = {
  unverified: "Unverified Publisher",
  pending: "Verification Pending",
  verified: "Verified Publisher",
  rejected: "Verification Rejected",
};

const verificationColor: Record<VerificationStatus, string> = {
  unverified: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  verified: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

interface PublisherHeaderProps {
  onPublishClick: () => void;
  displayName: string | null;
  verificationStatus: VerificationStatus | null;
}

export default function PublisherHeader({ onPublishClick, displayName, verificationStatus }: PublisherHeaderProps) {
  const initials = displayName
    ? displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]!.toUpperCase())
        .join("")
    : "?";

  return (
    <header className="hidden lg:block bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 lg:py-6 sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 truncate">
              Welcome back{displayName ? `, ${displayName}` : ""}
            </h2>
            {verificationStatus && (
              <Badge
                className={`${verificationColor[verificationStatus]} hover:${verificationColor[verificationStatus]} text-xs sm:text-sm flex-shrink-0`}
              >
                {verificationLabel[verificationStatus]}
              </Badge>
            )}
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
            <AvatarFallback className="bg-purple-100 text-purple-700">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}