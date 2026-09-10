import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSignUp } from "@clerk/clerk-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import RoleSelector from "./RoleSelector";
import { Alert, AlertDescription } from "../ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useApiClient } from "../../lib/apiClient";

type UserRole = "reader" | "publisher" | "reviewer";

interface RegisterFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  interests?: string;
  organizationName?: string;
  website?: string;
  description?: string;
  affiliation?: string;
  expertise?: string;
  reason?: string;
}

export default function RegisterForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const api = useApiClient();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Clerk usually requires the new email to be verified with a code before the
  // sign-up completes — this sub-view only appears when Clerk actually asks,
  // mirroring LoginForm's second-factor step.
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<{ data: RegisterFormData; role: UserRole } | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<{
    success: boolean;
    message: string;
    type: "pending-approval" | "unverified-publisher" | "success" | null;
  } | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<RegisterFormData>();
  const password = watch("password");

  function resetForm() {
    reset();
    setSelectedRole(null);
    setPending(null);
    setPendingVerification(false);
    setCode("");
  }

  // The Clerk session is now active — create the SourceIt profile.
  async function finishRegistration(data: RegisterFormData, role: UserRole) {
    if (role === "publisher") {
      const { data: created, error } = await api.POST("/publishers", {
        body: {
          fullName: data.fullName,
          email: data.email,
          organizationName: data.organizationName ?? "",
          website: data.website ?? "",
          description: data.description ?? "",
        },
      });
      if (error || !created) {
        toast.error("Signed up, but creating the publisher record failed");
        setIsLoading(false);
        return;
      }
      setRegistrationStatus({
        success: true,
        message:
          "Registration successful! Your publisher account has been created as 'Unverified Publisher'. Please complete the verification process to publish content.",
        type: "unverified-publisher",
      });
      toast.success("Publisher account created (unverified)");
    } else if (role === "reviewer") {
      const { data: created, error } = await api.POST("/reviewers/apply", {
        body: {
          fullName: data.fullName,
          email: data.email,
          affiliation: data.affiliation ?? "",
          expertise: data.expertise ?? "",
          applicationReason: data.reason ?? "",
        },
      });
      if (error || !created) {
        toast.error("Signed up, but submitting the reviewer application failed");
        setIsLoading(false);
        return;
      }
      setRegistrationStatus({
        success: true,
        message:
          "Registration submitted successfully! Your reviewer account is pending admin approval. You'll receive an email once your account is activated.",
        type: "pending-approval",
      });
      toast.info("Reviewer account pending approval");
    } else {
      setRegistrationStatus({
        success: true,
        message: "Registration successful! Welcome to the platform. You can now login with your credentials.",
        type: "success",
      });
      toast.success("Reader account created successfully!");
    }
    setIsLoading(false);
    resetForm();
  }

  const onSubmit = async (data: RegisterFormData) => {
    if (!selectedRole) {
      toast.error("Please select a role");
      return;
    }

    setIsLoading(true);
    setRegistrationStatus(null);

    // Readers have no backend endpoint yet — keep the local confirmation.
    if (selectedRole === "reader") {
      await finishRegistration(data, "reader");
      return;
    }

    if (!isLoaded) {
      setIsLoading(false);
      return;
    }

    try {
      const attempt = await signUp.create({ emailAddress: data.email, password: data.password });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        await finishRegistration(data, selectedRole);
        return;
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPending({ data, role: selectedRole });
      setPendingVerification(true);
      setIsLoading(false);
      toast.info("Check your email for a verification code");
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ?? "Could not create the account";
      toast.error(message);
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !code || !pending) return;
    setIsLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        toast.error("Incorrect or expired code");
        setIsLoading(false);
        return;
      }
      await setActive({ session: attempt.createdSessionId });
      await finishRegistration(pending.data, pending.role);
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ?? "Incorrect or expired code";
      toast.error(message);
      setIsLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="registerCode">Verification code</Label>
          <Input
            id="registerCode"
            placeholder="Enter the code emailed to you"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Verifying..." : "Verify & Create Account"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Registration Status Alert */}
      {registrationStatus && (
        <Alert className={
          registrationStatus.type === "pending-approval" 
            ? "border-amber-500 bg-amber-50"
            : registrationStatus.type === "unverified-publisher"
            ? "border-blue-500 bg-blue-50"
            : "border-green-500 bg-green-50"
        }>
          {registrationStatus.type === "pending-approval" ? (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          ) : registrationStatus.type === "unverified-publisher" ? (
            <AlertCircle className="h-4 w-4 text-blue-600" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          <AlertDescription className={
            registrationStatus.type === "pending-approval"
              ? "text-amber-800"
              : registrationStatus.type === "unverified-publisher"
              ? "text-blue-800"
              : "text-green-800"
          }>
            {registrationStatus.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Role Selection */}
      <div className="space-y-2">
        <Label>Select Your Role</Label>
        <RoleSelector selectedRole={selectedRole} onSelectRole={setSelectedRole} />
      </div>

      {/* Common Fields */}
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          placeholder="John Doe"
          {...register("fullName", { required: "Full name is required" })}
        />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="registerEmail">Email</Label>
        <Input
          id="registerEmail"
          type="email"
          placeholder="your@email.com"
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: "Invalid email address",
            },
          })}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="registerPassword">Password</Label>
        <Input
          id="registerPassword"
          type="password"
          placeholder="At least 6 characters"
          {...register("password", {
            required: "Password is required",
            minLength: {
              value: 6,
              message: "Password must be at least 6 characters",
            },
          })}
        />
        {errors.password && (
          <p className="text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Re-enter your password"
          {...register("confirmPassword", {
            required: "Please confirm your password",
            validate: (value) => value === password || "Passwords do not match",
          })}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Role-specific Fields */}
      {selectedRole === "reader" && (
        <div className="space-y-2">
          <Label htmlFor="interests">Interests / Categories (Optional)</Label>
          <Input
            id="interests"
            placeholder="Politics, Technology, Science..."
            {...register("interests")}
          />
          <p className="text-xs text-slate-500">
            Help us personalize your news feed
          </p>
        </div>
      )}

      {selectedRole === "publisher" && (
        <>
          <div className="pt-2 border-t border-slate-200">
            <p className="text-sm text-slate-600 mb-3">Publisher Information</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization Name</Label>
            <Input
              id="organizationName"
              placeholder="Your News Organization"
              {...register("organizationName", {
                required: selectedRole === "publisher" ? "Organization name is required" : false,
              })}
            />
            {errors.organizationName && (
              <p className="text-sm text-red-600">{errors.organizationName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://yourwebsite.com"
              {...register("website", {
                required: selectedRole === "publisher" ? "Website is required" : false,
                pattern: {
                  value: /^https?:\/\/.+/,
                  message: "Please enter a valid URL",
                },
              })}
            />
            {errors.website && (
              <p className="text-sm text-red-600">{errors.website.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Short Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of your organization..."
              rows={3}
              {...register("description", {
                required: selectedRole === "publisher" ? "Description is required" : false,
              })}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              Your account will be marked as "Unverified Publisher" until approved by our team.
            </AlertDescription>
          </Alert>
        </>
      )}

      {selectedRole === "reviewer" && (
        <>
          <div className="pt-2 border-t border-slate-200">
            <p className="text-sm text-slate-600 mb-3">Reviewer Information</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="affiliation">Affiliation</Label>
            <Input
              id="affiliation"
              placeholder="University, Institution, or Organization"
              {...register("affiliation", {
                required: selectedRole === "reviewer" ? "Affiliation is required" : false,
              })}
            />
            {errors.affiliation && (
              <p className="text-sm text-red-600">{errors.affiliation.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expertise">Area of Expertise</Label>
            <Input
              id="expertise"
              placeholder="e.g., Political Science, Climate Change, Healthcare"
              {...register("expertise", {
                required: selectedRole === "reviewer" ? "Area of expertise is required" : false,
              })}
            />
            {errors.expertise && (
              <p className="text-sm text-red-600">{errors.expertise.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Joining</Label>
            <Textarea
              id="reason"
              placeholder="Why do you want to be a reviewer on our platform?"
              rows={3}
              {...register("reason", {
                required: selectedRole === "reviewer" ? "Please provide a reason for joining" : false,
              })}
            />
            {errors.reason && (
              <p className="text-sm text-red-600">{errors.reason.message}</p>
            )}
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">
              Reviewer accounts require admin approval before activation. You'll be notified via email.
            </AlertDescription>
          </Alert>
        </>
      )}

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isLoading || !selectedRole}
      >
        {isLoading ? (
          "Creating Account..."
        ) : (
          <>
            <UserPlus className="w-4 h-4 mr-2" />
            Create Account
          </>
        )}
      </Button>
    </form>
  );
}
