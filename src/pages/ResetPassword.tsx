import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { resetPasswordSchema } from "@/lib/validations";
import { clearRecoveryState, readRecoveryState } from "@/lib/authRedirect";

type Phase = "checking" | "ready" | "invalid";

/** How long to wait for supabase-js to turn the email link into a recovery session. */
const SESSION_WAIT_MS = 6000;

/**
 * Landing page for Supabase Auth password-recovery emails. The link signs the
 * user in with a short-lived recovery session; the new password is then set
 * with supabase.auth.updateUser().
 */
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let settled = false;
    const link = readRecoveryState();
    if (link.error) {
      setLinkError(link.error);
      setPhase("invalid");
      return;
    }

    const markReady = () => {
      settled = true;
      setPhase("ready");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (link.recovery && session)) markReady();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (link.recovery && data.session) markReady();
    });

    const timer = setTimeout(() => {
      if (!settled) setPhase("invalid");
    }, SESSION_WAIT_MS);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const parsed = resetPasswordSchema.parse({ password, confirmPassword });
      const { error } = await supabase.auth.updateUser({ password: parsed.password });
      if (error) throw error;
      clearRecoveryState();
      toast.success("Password updated successfully! Please sign in with your new password.");
      await supabase.auth.signOut({ scope: "local" });
      navigate("/login");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Verifying your reset link…</p>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden px-4">
        <div className="currency-watermark top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg]">৳</div>
        <div className="vault-card p-8 w-full max-w-md relative z-10 text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-destructive font-medium">Invalid or expired reset link</p>
          <p className="text-muted-foreground text-sm">
            {linkError || "This link is invalid, has expired, or was already used."} Please request a new one.
          </p>
          <Button
            onClick={() => {
              clearRecoveryState();
              navigate("/forgot-password");
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden px-4">
      <div className="currency-watermark top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg]">৳</div>
      <div className="vault-card p-8 w-full max-w-md relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-muted-foreground mt-2 text-sm">Set your new password</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              className="bg-secondary border-border"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
