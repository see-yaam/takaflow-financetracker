import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CurrencyDoodles from "@/components/CurrencyDoodles";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
    }
    setLoading(false);
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
          <p className="text-muted-foreground mt-2 text-sm">Access your financial vault by login</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              required
              className="bg-secondary border-border min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-secondary border-border min-h-[44px]"
            />
          </div>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Forgot Password?
            </Link>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full min-h-[52px] text-white rounded-xl"
            style={{ background: "#2d6a4f" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#3a8a65")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2d6a4f")}
          >
            {loading ? "Authenticating..." : "Enter Vault"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-6">
          No account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Initialize vault
          </Link>
        </p>
      </div>
    </div>
  );
}
