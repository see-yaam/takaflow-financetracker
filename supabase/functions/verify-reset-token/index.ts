import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: "Token and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up token
    const { data: tokenRow, error: fetchError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .eq("used", false)
      .single();

    if (fetchError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset link" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(tokenRow.expires_at) < new Date()) {
      // Mark as used
      await supabase
        .from("password_reset_tokens")
        .update({ used: true })
        .eq("id", tokenRow.id);

      return new Response(
        JSON.stringify({ error: "Reset link has expired. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users.users.find(
      (u: { email?: string }) => u.email?.toLowerCase() === tokenRow.email.toLowerCase()
    );

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateError) throw updateError;

    // Mark token as used
    await supabase
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("id", tokenRow.id);

    return new Response(
      JSON.stringify({ message: "Password updated successfully!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-reset-token error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to reset password" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
