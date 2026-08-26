import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { BookOpen, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function ReaderPortal() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-8">
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
              <div className="p-4 bg-blue-100 rounded-full">
                <BookOpen className="w-12 h-12 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">Reader Portal</CardTitle>
            <CardDescription>
              Welcome to your personalized news verification dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">
                ✓ Login Successful
              </h3>
              <p className="text-green-700">
                You've successfully logged in as a Reader. This is where your personalized news feed and verification tools would appear.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border border-slate-200 rounded-lg">
                <h4 className="font-semibold mb-2">Featured Content</h4>
                <p className="text-sm text-slate-600">
                  Access verified news articles from trusted publishers
                </p>
              </div>
              
              <div className="p-4 border border-slate-200 rounded-lg">
                <h4 className="font-semibold mb-2">Verification History</h4>
                <p className="text-sm text-slate-600">
                  View your reading history and verification checks
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
