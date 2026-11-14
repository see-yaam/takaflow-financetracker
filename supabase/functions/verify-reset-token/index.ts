import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { findUserByEmail } from "../_shared/findUserByEmail.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("Origin"), Deno.env.get("ALLOWED_ORIGIN"));
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

    // Atomically claim the token: only one request can flip used=false -> true,
    // and only while it is unexpired. This closes the double-use race.
    const { data: tokenRow, error: claimError } = await supabase
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("token", token)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .select("id, email")
      .maybeSingle();

    if (claimError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset link. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const releaseToken = () =>
      supabase.from("password_reset_tokens").update({ used: false }).eq("id", tokenRow.id);

    // Find user by email across ALL pages (listUsers() alone only returns the first 50).
    let user;
    try {
      user = await findUserByEmail(supabase.auth.admin, tokenRow.email);
    } catch (lookupError) {
      await releaseToken(); // let the user retry the same link
      throw lookupError;
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update password; if it fails, release the token so the same link can be retried.
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateError) {
      await releaseToken();
      throw updateError;
    }

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
