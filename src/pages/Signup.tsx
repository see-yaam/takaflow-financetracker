import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import CurrencyDoodles from "@/components/CurrencyDoodles";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { 
  KeyRound, 
  Mail, 
  User as UserIcon, 
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

type Step = "email" | "otp" | "account";

export default function Signup() {
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Step 1: Email
  const [email, setEmail] = useState("");

  // Step 2: OTP
  const [otp, setOtp] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Step 3: Account (Name + Password + Confirm Password)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "otp" && resendTimer > 0) {
      timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [step, resendTimer]);

  // 1. Submit Email & Request OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      toast.success("6-digit verification code sent to your email!");
      setStep("otp");
      setResendTimer(60);
      setCanResend(false);
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (!canResend || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      toast.success("New verification code sent!");
      setResendTimer(60);
      setCanResend(false);
      setOtp("");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify OTP
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter the complete 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: "email",
      });
      if (error) throw error;
      toast.success("Email verified! Now set up your account.");
      setStep("account");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  // 3. Finalize Account (Name + Password + Confirm Password)
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match. Please re-enter.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
        data: {
          full_name: fullName.trim(),
        },
      });
      if (error) throw error;
      toast.success(`Welcome to TakaFlow, ${fullName.trim()}! Your vault is ready.`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  // 3-step progress list
  const stepsList = [
    { id: "email", label: "Email" },
    { id: "otp", label: "Verify" },
    { id: "account", label: "Account" },
  ];

  const currentStepIndex = stepsList.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background relative overflow-hidden px-4 py-8">
      <CurrencyDoodles />

      {/* Back to Home Link */}
      <div className="w-full max-w-md relative z-10 mb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
        >
          ← Back to TakaFlow Home
        </Link>
      </div>

      {/* Main Vault Card */}
      <div
        className="vault-card p-6 sm:p-8 w-full max-w-md relative z-10"
        style={{
          border: "1px solid rgba(57, 255, 20, 0.25)",
          boxShadow: "0 0 50px rgba(57, 255, 20, 0.08)",
        }}
      >
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <Link to="/" className="inline-block hover:opacity-90 transition-opacity">
            <h1 className="text-3xl font-bold tracking-tighter text-foreground flex items-center justify-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-primary/20 text-primary font-bold flex items-center justify-center text-lg shadow-[0_0_12px_rgba(57,255,20,0.3)]">
                ৳
              </span>
              TakaFlow
            </h1>
          </Link>
          <p className="text-muted-foreground mt-2 text-xs">
            {step === "email" && "Initialize your secure financial vault"}
            {step === "otp" && "Verify your email identity"}
            {step === "account" && "Set up your vault credentials"}
          </p>

          {/* Stepper Dots (3 Steps) */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {stepsList.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentStepIndex
                      ? "w-8 bg-primary shadow-[0_0_10px_rgba(57,255,20,0.4)]"
                      : idx < currentStepIndex
                      ? "w-2.5 bg-primary/50"
                      : "w-2 bg-secondary"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ============================================================ */}
        {/* STEP 1: EMAIL */}
        {/* ============================================================ */}
        {step === "email" && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signup-email" className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" /> Email Address
              </Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                required
                autoFocus
                autoComplete="email"
                className="bg-secondary border-border min-h-[46px] rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full min-h-[50px] bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] rounded-xl mt-3 flex items-center justify-center gap-2"
            >
              {loading ? "Sending Code..." : "Send 6-Digit Code →"}
            </Button>
          </form>
        )}

        {/* ============================================================ */}
        {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
        {/* ============================================================ */}
        {step === "otp" && (
          <div>
            <div className="mb-4 text-center">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground">
                <span>Code sent to:</span>
                <span className="font-semibold text-foreground">{email}</span>
              </div>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" /> 6-Digit Verification Code
                </Label>
                <div className="flex justify-center my-3">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(val) => {
                      setOtp(val);
                      if (val.length === 6) {
                        setTimeout(() => {
                          handleVerifyOtp();
                        }, 200);
                      }
                    }}
                    autoFocus
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      <InputOTPSlot index={0} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={1} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={2} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={3} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={4} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={5} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              {/* Resend Section */}
              <div className="flex items-center justify-center text-xs text-muted-foreground gap-1">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <RefreshCw className="h-3 w-3" /> Resend Code
                  </button>
                ) : (
                  <span>Resend code in <strong className="text-foreground">{resendTimer}s</strong></span>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full min-h-[50px] bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] rounded-xl mt-3 flex items-center justify-center gap-2"
              >
                {loading ? "Verifying..." : "Verify Code →"}
              </Button>
            </form>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 3: CREATE ACCOUNT (NAME + PASSWORD + CONFIRM PASSWORD) */}
        {/* ============================================================ */}
        {step === "account" && (
          <form onSubmit={handleCreateAccount} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="signup-name" className="text-xs font-semibold flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5 text-primary" /> Full Name
              </Label>
              <Input
                id="signup-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Seyam Bhuyan"
                required
                autoFocus
                autoComplete="name"
                className="bg-secondary border-border min-h-[46px] rounded-xl"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="signup-password" className="text-xs font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary" /> Create Password
              </Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="bg-secondary border-border min-h-[46px] pr-10 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="signup-confirm-password" className="text-xs font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary" /> Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type password again"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="bg-secondary border-border min-h-[46px] pr-10 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && confirmPassword && (
                <p className={`text-[11px] mt-1 font-medium ${password === confirmPassword ? "text-primary" : "text-destructive"}`}>
                  {password === confirmPassword ? "✓ Passwords match" : "✕ Passwords do not match"}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || !fullName.trim() || password.length < 6 || password !== confirmPassword}
              className="w-full min-h-[50px] bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] rounded-xl mt-3 flex items-center justify-center gap-2"
            >
              {loading ? "Creating Vault..." : "Create Vault & Enter →"}
            </Button>
          </form>
        )}

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground mt-6 pt-4 border-t border-border/50">
          Already have a vault?{" "}
          <Link to="/login" className="text-primary hover:underline font-semibold">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
