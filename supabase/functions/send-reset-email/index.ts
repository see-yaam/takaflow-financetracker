import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildEmailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Cormorant+Garamond:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Cormorant Garamond', Georgia, serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #0a0a0a; }
    .header { text-align: center; padding: 40px 20px 30px; }
    .taka-symbol { font-size: 64px; color: #c9a84c; opacity: 0.3; font-family: 'Playfair Display', serif; }
    .brand-name { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: #c9a84c; margin: 10px 0 4px; letter-spacing: 2px; }
    .brand-sub { font-family: 'Cormorant Garamond', serif; font-size: 14px; color: #8a8a8a; letter-spacing: 3px; text-transform: uppercase; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, #c9a84c33, transparent); margin: 0 40px; }
    .ticker { text-align: center; padding: 12px 0; color: #c9a84c33; font-size: 14px; letter-spacing: 6px; overflow: hidden; white-space: nowrap; }
    .content { padding: 40px 40px; }
    .content h2 { font-family: 'Playfair Display', serif; font-size: 24px; color: #e0e0e0; text-align: center; margin: 0 0 24px; }
    .content p { font-size: 16px; color: #a0a0a0; line-height: 1.7; text-align: center; margin: 0 0 16px; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn-wrap a { display: inline-block; background: linear-gradient(135deg, #c9a84c, #b8963f); color: #0a0a0a; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 16px; padding: 14px 48px; border-radius: 6px; text-decoration: none; letter-spacing: 1px; }
    .info-row { display: flex; justify-content: center; gap: 40px; margin: 32px 0; }
    .info-box { text-align: center; }
    .info-label { font-size: 11px; color: #666; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
    .info-value { font-family: 'Playfair Display', serif; font-size: 18px; color: #c9a84c; }
    .note { font-size: 13px; color: #666; text-align: center; margin-top: 24px; line-height: 1.6; }
    .footer { text-align: center; padding: 30px 20px; }
    .footer p { margin: 4px 0; }
    .footer .copy { font-size: 13px; color: #666; }
    .footer .tagline { font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="taka-symbol">৳</div>
      <div class="brand-name">TakaFlow</div>
      <div class="brand-sub">Personal Finance Tracker</div>
      <div class="divider" style="margin-top:20px;"></div>
    </div>
    <div class="ticker">$ € £ ৳ $ € £ ৳ $ € £ ৳ $ € £ ৳</div>
    <div class="content">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset the password for your TakaFlow account. Click the button below to set a new password and get back to tracking your finances.</p>
      <div class="divider"></div>
      <div class="btn-wrap">
        <a href="${resetUrl}">Reset My Password</a>
      </div>
      <div class="divider"></div>
      <!--[if mso]>
      <table role="presentation" width="100%"><tr>
      <td width="50%" align="center" valign="top">
      <![endif]-->
      <table role="presentation" width="100%" style="margin:32px 0;">
        <tr>
          <td width="50%" align="center" valign="top">
            <div class="info-label">EXPIRES IN</div>
            <div class="info-value">1 Hour</div>
          </td>
          <td width="50%" align="center" valign="top">
            <div class="info-label">SECURITY</div>
            <div class="info-value">One-time</div>
          </td>
        </tr>
      </table>
      <!--[if mso]></tr></table><![endif]-->
      <p class="note">If you did not request a password reset, you can safely ignore this email. Your account remains secure.</p>
    </div>
    <div class="ticker">$ € £ ৳ $ € £ ৳ $ € £ ৳ $ € £ ৳</div>
    <div class="footer">
      <p class="copy">© 2026 TakaFlow</p>
      <p class="tagline">Track every taka. Own your finances.</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if user exists in auth
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const userExists = users.users.some(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    // Always return success to prevent email enumeration
    if (!userExists) {
      return new Response(
        JSON.stringify({ message: "If an account exists, a reset link has been sent." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalidate any existing unused tokens for this email
    await supabase
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("email", email.toLowerCase())
      .eq("used", false);

    // Generate token and store
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        email: email.toLowerCase(),
        token,
        expires_at: expiresAt,
        used: false,
      });

    if (insertError) throw insertError;

    // Send email via Resend
    const resetUrl = `https://takaflow-financetracker.vercel.app/reset-password?token=${token}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TakaFlow <onboarding@resend.dev>",
        to: [email],
        subject: "TakaFlow — Reset Your Password",
        html: buildEmailHtml(resetUrl),
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      throw new Error(`Resend API error [${resendRes.status}]: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ message: "If an account exists, a reset link has been sent." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-reset-email error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
