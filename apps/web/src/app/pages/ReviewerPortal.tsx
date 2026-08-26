import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Shield, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function ReviewerPortal() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="outline"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Button>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-green-100 rounded-full">
                <Shield className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">Reviewer Portal</CardTitle>
            <CardDescription>
              Verify content authenticity and maintain platform integrity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">
                ✓ Login Successful
              </h3>
              <p className="text-green-700">
                You've successfully logged in as a Reviewer. This is where your content verification dashboard would appear.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border border-slate-200 rounded-lg">
                <h4 className="font-semibold mb-2">Pending Reviews</h4>
                <p className="text-sm text-slate-600">
                  Content awaiting your expert verification
                </p>
              </div>
              
              <div className="p-4 border border-slate-200 rounded-lg">
                <h4 className="font-semibold mb-2">Review History</h4>
                <p className="text-sm text-slate-600">
                  Track your verification contributions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
