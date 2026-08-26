import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function SimpleAuth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple check
    if (email === "publisher@example.com" && password === "publisher123") {
      toast.success("Login successful!");
      setTimeout(() => {
        navigate("/publisher-portal");
      }, 500);
    } else if (email === "reader@example.com" && password === "reader123") {
      toast.success("Login successful!");
      setTimeout(() => {
        navigate("/reader-portal");
      }, 500);
    } else if (email === "reviewer@example.com" && password === "reviewer123") {
      toast.success("Login successful!");
      setTimeout(() => {
        navigate("/reviewer-portal");
      }, 500);
    } else {
      toast.error("Invalid credentials. Try: publisher@example.com / publisher123");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Daily Planet Login</CardTitle>
          <CardDescription>Login to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="publisher@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="publisher123"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Login
            </Button>

            <div className="pt-4 border-t mt-4">
              <p className="text-sm text-slate-600 mb-2">Demo Credentials:</p>
              <div className="space-y-1 text-xs text-slate-500">
                <p>Publisher: publisher@example.com / publisher123</p>
                <p>Reader: reader@example.com / reader123</p>
                <p>Reviewer: reviewer@example.com / reviewer123</p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}