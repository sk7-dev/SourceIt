import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

// Mock user database
const mockUsers = [
  { email: "reader@example.com", password: "reader123", role: "reader" },
  { email: "publisher@example.com", password: "publisher123", role: "publisher" },
  { email: "reviewer@example.com", password: "reviewer123", role: "reviewer" },
];

export default function LoginForm() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setErrors({});
    
    // Validation
    const newErrors: { email?: string; password?: string } = {};
    
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
      newErrors.email = "Invalid email address";
    }
    
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      const user = mockUsers.find(
        (u) => u.email === email && u.password === password
      );

      if (user) {
        toast.success("Login successful! Redirecting...");
        
        // Role-based redirect
        setTimeout(() => {
          switch (user.role) {
            case "reader":
              navigate("/user-portal");
              break;
            case "publisher":
              navigate("/publisher-portal");
              break;
            case "reviewer":
              navigate("/reviewer-portal");
              break;
          }
        }, 500);
      } else {
        toast.error("Invalid email or password");
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={errors.email ? "border-red-500" : ""}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={errors.password ? "border-red-500" : ""}
        />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="link"
          className="px-0 text-sm text-blue-600 hover:text-blue-700"
          onClick={() => toast.info("Password reset feature coming soon!")}
        >
          Forgot Password?
        </Button>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          "Logging in..."
        ) : (
          <>
            <LogIn className="w-4 h-4 mr-2" />
            Login
          </>
        )}
      </Button>

      <div className="pt-4 border-t border-slate-200">
        <p className="text-sm text-slate-600 text-center">
          Demo credentials:
        </p>
        <div className="mt-2 space-y-1 text-xs text-slate-500 text-center">
          <p>Reader: reader@example.com / reader123</p>
          <p>Publisher: publisher@example.com / publisher123</p>
          <p>Reviewer: reviewer@example.com / reviewer123</p>
        </div>
      </div>
    </form>
  );
}