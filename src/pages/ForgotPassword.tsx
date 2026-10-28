import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CurrencyDoodles from "@/components/CurrencyDoodles";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { forgotPasswordSchema } from "@/lib/validations";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const parsed = forgotPasswordSchema.parse({ email: email.trim().toLowerCase() });
      const { data, error } = await supabase.functions.invoke("send-reset-email", {
        body: parsed,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSent(true);
      toast.success("If an account exists, a reset link has been sent!");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background relative overflow-hidden px-4 py-8">
      <CurrencyDoodles />

      <div className="w-full max-w-md relative z-10 mb-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
        </Link>
      </div>

      <div
        className="vault-card p-6 sm:p-8 w-full max-w-md relative z-10"
        style={{
          border: "1px solid rgba(57, 255, 20, 0.25)",
          boxShadow: "0 0 50px rgba(57, 255, 20, 0.08)",
        }}
      >
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
            Recover access to your financial vault
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4 py-4">
            <div className="h-12 w-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(57,255,20,0.25)]">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-foreground">Password Reset Link Sent</h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              We've dispatched recovery instructions to <strong className="text-foreground">{email}</strong>. Please check your inbox and follow the secure link.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center w-full min-h-[46px] bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" /> Your Vault Email
              </Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                required
                autoFocus
                className="bg-secondary border-border min-h-[46px] rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter your registered email and we'll send you a password recovery link.
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full min-h-[50px] bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] rounded-xl mt-2"
            >
              {loading ? "Sending Link..." : "Send Reset Link →"}
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">
              Remember your password?{" "}
              <Link to="/login" className="text-primary hover:underline font-semibold">
                Sign in here
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
