import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CurrencyDoodles from "@/components/CurrencyDoodles";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { loginSchema } from "@/lib/validations";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const parsed = loginSchema.parse({ email: cleanEmail, password });
      const { error } = await supabase.auth.signInWithPassword(parsed);
      if (error) throw error;
      toast.success("Welcome back! Unlocking vault...");
      navigate("/dashboard");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

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

      {/* Main Vault Sign In Card */}
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
            Unlock your secure financial vault
          </p>
        </div>

        {/* Email & Password Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-semibold flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-primary" /> Email Address
            </Label>
            <Input
              id="login-email"
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

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label htmlFor="login-password" className="text-xs font-semibold flex items-center gap-1.5 shrink-0">
                <Lock className="h-3.5 w-3.5 text-primary" /> Password
              </Label>
              <Link
                to="/forgot-password"
                className="text-xs text-primary hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
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

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full min-h-[50px] bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] rounded-xl mt-3 flex items-center justify-center gap-2"
          >
            {loading ? "Unlocking Vault..." : "Enter Vault →"}
          </Button>
        </form>

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground mt-6 pt-4 border-t border-border/50">
          Don't have a vault yet?{" "}
          <Link to="/signup" className="text-primary hover:underline font-semibold">
            Initialize vault
          </Link>
        </p>
      </div>
    </div>
  );
}
