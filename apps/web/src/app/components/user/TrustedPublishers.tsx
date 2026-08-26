import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { CheckCircle, UserPlus } from "lucide-react";

const publishers = [
  {
    id: 1,
    name: "Global News Network",
    verified: true,
    credibilityScore: 94,
    categories: ["Politics", "World", "Economy"],
    transparencyLevel: "Excellent",
    following: true,
  },
  {
    id: 2,
    name: "TechDaily",
    verified: true,
    credibilityScore: 88,
    categories: ["Technology", "Science", "Innovation"],
    transparencyLevel: "Very Good",
    following: false,
  },
  {
    id: 3,
    name: "Health Watch",
    verified: true,
    credibilityScore: 92,
    categories: ["Health", "Medicine", "Research"],
    transparencyLevel: "Excellent",
    following: true,
  },
  {
    id: 4,
    name: "Financial Times",
    verified: true,
    credibilityScore: 90,
    categories: ["Business", "Finance", "Markets"],
    transparencyLevel: "Excellent",
    following: false,
  },
];

const getTransparencyColor = (level: string) => {
  if (level === "Excellent") return "bg-green-100 text-green-700 border-green-200";
  if (level === "Very Good") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export default function TrustedPublishers() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trusted Publishers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publishers.map((publisher) => (
            <div
              key={publisher.id}
              className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-slate-900">{publisher.name}</h4>
                    {publisher.verified && (
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      {publisher.credibilityScore}% Credible
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getTransparencyColor(publisher.transparencyLevel)}`}>
                      {publisher.transparencyLevel}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {publisher.categories.map((category) => (
                  <span
                    key={category}
                    className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded"
                  >
                    {category}
                  </span>
                ))}
              </div>

              <Button
                variant={publisher.following ? "outline" : "default"}
                size="sm"
                className={publisher.following ? "w-full" : "w-full bg-blue-600 hover:bg-blue-700"}
              >
                {publisher.following ? (
                  <>Following</>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Follow Publisher
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
