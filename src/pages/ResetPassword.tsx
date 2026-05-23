import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { resetPasswordSchema } from "@/lib/validations";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const parsed = resetPasswordSchema.parse({ password, confirmPassword });
      const { data, error } = await supabase.functions.invoke("verify-reset-token", {
        body: { token, password: parsed.password },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Password updated successfully!");
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    }

    setLoading(false);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
        <div className="currency-watermark top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg]">৳</div>
        <div className="vault-card p-8 w-full max-w-md relative z-10 text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tighter text-foreground">TakaFlow</h1>
          <p className="text-destructive font-medium">Invalid reset link</p>
          <p className="text-muted-foreground text-sm">This link is invalid or has expired. Please request a new one.</p>
          <Button onClick={() => navigate("/forgot-password")} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
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
