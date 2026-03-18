import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created! Now Login with your gmail & password.");
      navigate("/login");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      <div className="currency-watermark top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[15deg]">$</div>
      <div className="vault-card p-8 w-full max-w-md relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-muted-foreground mt-2 text-sm">Initialize your financial vault</p>
          <p className="mt-2 text-sm" style={{color: '#39ff14'}}>Create your account</p>
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
              placeholder="you@example.com"
              required
              className="bg-secondary border-border"
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
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="bg-secondary border-border" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            {loading ? "Creating vault..." : "Create Vault"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have a vault?{" "}
          <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
