import { useState } from "react";
import { useNavigate } from "react-router";
import { useSignIn } from "@clerk/clerk-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";

export default function LoginForm() {
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const api = useApiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  // Some Clerk instances require a second factor (e.g. an emailed code) even
  // for password sign-in — this step only appears when Clerk actually asks
  // for one, per that instance's own configured security policy.
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [code, setCode] = useState("");

  async function completeSignIn(sessionId: string) {
    await setActive({ session: sessionId });

    const { data: me, error } = await api.GET("/me");
    if (error || !me) {
      toast.error("Signed in, but no SourceIt account exists for this session yet");
      setIsLoading(false);
      return;
    }

    toast.success("Login successful! Redirecting...");
    switch (me.account.role) {
      case "reader":
        navigate("/user-portal");
        break;
      case "publisher":
        navigate("/publisher-portal");
        break;
      case "reviewer":
        navigate("/reviewer-portal");
        break;
      case "admin":
        navigate("/user-portal");
        break;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

    if (!isLoaded) return;

    setIsLoading(true);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await completeSignIn(attempt.createdSessionId);
        return;
      }

      if (attempt.status === "needs_second_factor") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsSecondFactor(true);
        toast.info("Check your email for a verification code");
        setIsLoading(false);
        return;
      }

      toast.error("Additional verification is required for this account");
      setIsLoading(false);
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        "Invalid email or password";
      toast.error(message);
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !code) return;

    setIsLoading(true);
    try {
      const attempt = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        toast.error("Incorrect or expired code");
        setIsLoading(false);
        return;
      }
      await completeSignIn(attempt.createdSessionId);
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ?? "Incorrect or expired code";
      toast.error(message);
      setIsLoading(false);
    }
  };

  if (needsSecondFactor) {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            placeholder="Enter the code emailed to you"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Verifying..." : "Verify"}
        </Button>
      </form>
    );
  }

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
    </form>
  );
}
