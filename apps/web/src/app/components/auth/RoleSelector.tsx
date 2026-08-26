import { BookOpen, Newspaper, Shield } from "lucide-react";
import { cn } from "../ui/utils";

type UserRole = "reader" | "publisher" | "reviewer";

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onSelectRole: (role: UserRole) => void;
}

const roles = [
  {
    id: "reader" as UserRole,
    name: "Reader",
    icon: BookOpen,
    description: "Discover and verify trusted news",
    color: "blue",
  },
  {
    id: "publisher" as UserRole,
    name: "Publisher",
    icon: Newspaper,
    description: "Publish and build credibility",
    color: "purple",
  },
  {
    id: "reviewer" as UserRole,
    name: "Reviewer",
    icon: Shield,
    description: "Verify content authenticity",
    color: "green",
  },
];

export default function RoleSelector({ selectedRole, onSelectRole }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {roles.map((role) => {
        const Icon = role.icon;
        const isSelected = selectedRole === role.id;

        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onSelectRole(role.id)}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:shadow-md",
              isSelected
                ? role.color === "blue"
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : role.color === "purple"
                  ? "border-purple-500 bg-purple-50 shadow-md"
                  : "border-green-500 bg-green-50 shadow-md"
                : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <div
              className={cn(
                "p-2 rounded-full",
                isSelected
                  ? role.color === "blue"
                    ? "bg-blue-100"
                    : role.color === "purple"
                    ? "bg-purple-100"
                    : "bg-green-100"
                  : "bg-slate-100"
              )}
            >
              <Icon
                className={cn(
                  "w-6 h-6",
                  isSelected
                    ? role.color === "blue"
                      ? "text-blue-600"
                      : role.color === "purple"
                      ? "text-purple-600"
                      : "text-green-600"
                    : "text-slate-600"
                )}
              />
            </div>
            
            <div className="text-center">
              <p className="font-semibold text-sm text-slate-900">{role.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
