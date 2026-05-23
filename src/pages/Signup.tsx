import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CurrencyDoodles from "@/components/CurrencyDoodles";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { signupSchema } from "@/lib/validations";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const navigate = useNavigate();

  const isGmail = email.trim().toLowerCase().endsWith("@gmail.com");
  const showHint = emailFocused && !emailBlurred;
  const showWarning = emailBlurred && email.includes("@") && !isGmail;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const parsed = signupSchema.parse({ email, password });
      const { error } = await supabase.auth.signUp({
        email: parsed.email,
        password: parsed.password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Account created! Now Login with your gmail & password.");
      navigate("/login");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden px-4">
      <CurrencyDoodles />
      <div
        className="vault-card p-6 sm:p-8 w-full max-w-md relative z-10"
        style={{
          border: "1px solid rgba(57, 255, 20, 0.2)",
          boxShadow: "0 0 40px rgba(57, 255, 20, 0.05)",
        }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-muted-foreground mt-2 text-sm">Initialize your financial vault by creating your account</p>
        </div>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailBlurred) setEmailBlurred(false);
              }}
              onFocus={() => {
                setEmailFocused(true);
                setEmailBlurred(false);
              }}
              onBlur={() => {
                setEmailBlurred(true);
                setEmailFocused(false);
              }}
              placeholder="you@gmail.com"
              required
              className="bg-secondary border-border min-h-[44px]"
            />
            {showHint && (
              <p className="text-xs text-amber-500/80 mt-1">
                💡 Use a Gmail address (gmail.com) for the best experience.
              </p>
            )}
            {showWarning && (
              <p className="text-xs text-amber-500 mt-1">
                ⚠️ Non-Gmail addresses may not receive password reset emails. We recommend using a Gmail address (gmail.com).
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="bg-secondary border-border min-h-[44px]" />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full min-h-[52px] text-white rounded-xl"
            style={{ background: "#2d6a4f" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#3a8a65")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2d6a4f")}
          >
            {loading ? "Creating vault..." : "Create Vault"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have a vault?{" "}
          <Link to="/login" className="text-primary hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
