import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { mapSupabaseError, throwIfSupabaseError } from "@/lib/supabaseErrors";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import SettingsDangerZone from "@/components/settings/SettingsDangerZone";
import ProfilePhotoCropperModal from "@/components/ProfilePhotoCropperModal";
import {
  User as UserIcon,
  Mail,
  Lock,
  Camera,
  Trash2,
  Check,
  Pencil,
  X,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Avatar & Name State
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  // Email Change State (with 6-Digit OTP verification)
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailStep, setEmailStep] = useState<"input" | "otp">("input");
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailResendTimer, setEmailResendTimer] = useState(60);
  const [emailCanResend, setEmailCanResend] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Danger Zone & Sign Out
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const avatarUrl = user?.user_metadata?.avatar_url;
  const fullName = user?.user_metadata?.full_name;

  // Countdown timer for Email OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showEmailForm && emailStep === "otp" && emailResendTimer > 0) {
      timer = setTimeout(() => setEmailResendTimer((prev) => prev - 1), 1000);
    } else if (emailResendTimer === 0) {
      setEmailCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [showEmailForm, emailStep, emailResendTimer]);

  // 1. Upload Profile Photo with Interactive Cropper (Max 10MB, supports HEIC)
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Up to 10MB input is safe since Canvas downscales & crops to ~40KB before sending to database
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("Image size exceeds 10MB limit. Please select a photo within 10MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      /\.(heic|heif)$/i.test(file.name);

    if (!isHeic && !file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file (PNG, JPG, WebP, HEIC).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let processableBlob: Blob = file;

    // Convert iPhone HEIC/HEIF to JPEG on-the-fly
    if (isHeic) {
      const toastId = toast.loading("Converting iPhone HEIC photo...");
      try {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        });
        processableBlob = Array.isArray(converted) ? converted[0] : converted;
        toast.dismiss(toastId);
      } catch (conversionErr) {
        toast.dismiss(toastId);
        console.error("HEIC conversion failed:", conversionErr);
        toast.error("Could not process HEIC image. Please select a JPG or PNG photo.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setRawImageSrc(result);
        setCropperOpen(true);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(processableBlob);
  };

  const handleCropComplete = async (croppedDataUrl: string) => {
    setUploading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user?.user_metadata,
          avatar_url: croppedDataUrl,
        },
      });

      if (error) throw error;
      toast.success("Profile photo updated successfully!");
    } catch (err) {
      toast.error(mapSupabaseError(err));
      throw err;
    } finally {
      setUploading(false);
    }
  };

  // 2. Remove Profile Photo
  const handleRemovePhoto = async () => {
    if (!avatarUrl || uploading) return;
    setUploading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user?.user_metadata,
          avatar_url: null,
        },
      });
      if (error) throw error;
      toast.success("Profile photo removed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setUploading(false);
    }
  };

  // 3. Update Full Name
  const handleSaveName = async () => {
    if (!nameInput.trim() || savingName) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user?.user_metadata,
          full_name: nameInput.trim(),
        },
      });
      if (error) throw error;
      toast.success("Display name updated!");
      setEditingName(false);
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setSavingName(false);
    }
  };

  // 4A. Request Email Change & Send 6-Digit OTP
  const handleRequestEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please enter a valid new email address.");
      return;
    }
    if (cleanEmail === user?.email?.toLowerCase()) {
      toast.error("New email must be different from current email.");
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: cleanEmail,
      });
      if (error) throw error;
      toast.success("6-digit verification code sent to your new email!");
      setEmailStep("otp");
      setEmailResendTimer(60);
      setEmailCanResend(false);
      setEmailOtp("");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setSavingEmail(false);
    }
  };

  // 4B. Resend Email Change OTP
  const handleResendEmailOtp = async () => {
    if (!emailCanResend || savingEmail) return;
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim().toLowerCase(),
      });
      if (error) throw error;
      toast.success("New 6-digit verification code sent!");
      setEmailResendTimer(60);
      setEmailCanResend(false);
      setEmailOtp("");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setSavingEmail(false);
    }
  };

  // 4C. Verify OTP and finalize email change
  const handleVerifyEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (emailOtp.length !== 6) {
      toast.error("Please enter the complete 6-digit verification code.");
      return;
    }

    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: newEmail.trim().toLowerCase(),
        token: emailOtp,
        type: "email_change",
      });
      if (error) throw error;
      toast.success("Email address updated successfully!");
      setShowEmailForm(false);
      setEmailStep("input");
      setNewEmail("");
      setEmailOtp("");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setSavingEmail(false);
    }
  };

  // 5. Change Password (verifying previous password first)
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setSavingPassword(true);
    try {
      // Step A: Verify previous password by attempting authentication
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error("Current password is incorrect. Please re-enter your current password.");
      }

      // Step B: Set new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      toast.success("Password changed successfully! Your vault is secured.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(mapSupabaseError(err));
    } finally {
      setSavingPassword(false);
    }
  };

  // 6. Danger Zone Reset Account
  const handleResetAccount = async () => {
    if (resetConfirm !== "RESET" || !user) return;
    setResetting(true);
    try {
      const tables = [
        "debt_additions",
        "debt_payments",
        "debts",
        "monthly_snapshots",
        "recurring_transactions",
        "budget_goals",
        "savings_goals",
        "transactions",
        "wallets",
      ] as const;

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", user.id);
        throwIfSupabaseError(error);
      }

      await queryClient.clear();
      await signOut();

      toast.success("Account reset successfully. Starting fresh!");
      setResetOpen(false);
      setResetConfirm("");
      window.location.href = "/login";
    } catch (e) {
      toast.error(mapSupabaseError(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Vault Account & Profile</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Manage your personal details, credentials, and security settings.
        </p>
      </div>

      {/* ============================================================ */}
      {/* 1. VAULT ACCOUNT & PROFILE (AVATAR & NAME) */}
      {/* ============================================================ */}
      <div className="vault-card p-5 sm:p-6">
        <h3 className="wallet-label mb-4 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-primary" /> Profile Details
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
          {/* Avatar with click to upload */}
          <div className="relative group shrink-0 self-start sm:self-center">
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="h-16 w-16 rounded-full border-2 border-primary/40 overflow-hidden cursor-pointer bg-secondary flex items-center justify-center relative transition-all hover:border-primary hover:shadow-[0_0_15px_rgba(57,255,20,0.25)]"
              title="Click to change profile picture"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-primary/20 text-primary font-bold text-xl flex items-center justify-center">
                  {(fullName?.[0] || user?.email?.[0] || "U").toUpperCase()}
                </div>
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </div>

            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploading}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                title="Remove profile picture"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.HEIC,.heif,.HEIF"
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* User Details & Editable Name */}
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2 mb-1.5 max-w-sm">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your Full Name"
                  autoFocus
                  className="h-8 text-sm bg-secondary border-border"
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={savingName || !nameInput.trim()}
                  className="h-8 px-2.5 bg-primary text-primary-foreground font-semibold text-xs"
                >
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNameInput(fullName || "");
                    setEditingName(false);
                  }}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-foreground truncate">
                  {fullName || "Anonymous Vault Owner"}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(fullName || "");
                    setEditingName(true);
                  }}
                  className="text-muted-foreground hover:text-primary transition-colors p-1"
                  title="Edit name"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                Verified Vault User
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-muted-foreground hover:text-primary underline transition-colors"
              >
                {avatarUrl ? "Change photo" : "Upload photo (max 5MB)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. CHANGE EMAIL ADDRESS (WITH 6-DIGIT OTP) */}
      {/* ============================================================ */}
      <div className="vault-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="wallet-label flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Email Address
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primary email used for vault access and security alerts.
            </p>
          </div>
          {!showEmailForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowEmailForm(true);
                setEmailStep("input");
                setNewEmail("");
                setEmailOtp("");
              }}
              className="text-xs border-border hover:border-primary/50"
            >
              Change Email
            </Button>
          )}
        </div>

        {!showEmailForm ? (
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border/60">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{user?.email}</span>
            </div>
            <span className="text-[11px] text-primary font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Active
            </span>
          </div>
        ) : emailStep === "input" ? (
          /* STEP 1: Enter New Email */
          <form onSubmit={handleRequestEmailOtp} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs font-semibold">New Email Address</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="newemail@gmail.com"
                required
                autoFocus
                className="bg-secondary border-border min-h-[42px] rounded-xl text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                A 6-digit confirmation code will be sent to this email.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                disabled={savingEmail || !newEmail.trim()}
                className="bg-primary text-primary-foreground font-semibold text-xs h-9"
              >
                {savingEmail ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Sending Code...
                  </>
                ) : (
                  "Send 6-Digit Code →"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowEmailForm(false);
                  setNewEmail("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground h-9"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          /* STEP 2: Enter 6-Digit Verification Code */
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-secondary/50 rounded-xl border border-border/60 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary border border-border text-xs text-muted-foreground mb-1">
                <span>Code sent to:</span>
                <span className="font-semibold text-foreground">{newEmail}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit verification code from your inbox.
              </p>
            </div>

            <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" /> 6-Digit Verification Code
                </Label>
                <div className="flex justify-center my-3">
                  <InputOTP
                    maxLength={6}
                    value={emailOtp}
                    onChange={(val) => {
                      setEmailOtp(val);
                      if (val.length === 6) {
                        setTimeout(() => {
                          handleVerifyEmailOtp();
                        }, 200);
                      }
                    }}
                    autoFocus
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      <InputOTPSlot index={0} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={1} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={2} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={3} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={4} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                      <InputOTPSlot index={5} className="w-10 sm:w-11 h-12 text-lg font-bold bg-secondary border-border" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              {/* Resend Section */}
              <div className="flex items-center justify-center text-xs text-muted-foreground gap-1">
                {emailCanResend ? (
                  <button
                    type="button"
                    onClick={handleResendEmailOtp}
                    disabled={savingEmail}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <RefreshCw className="h-3 w-3" /> Resend Code
                  </button>
                ) : (
                  <span>Resend code in <strong className="text-foreground">{emailResendTimer}s</strong></span>
                )}
              </div>

              <div className="flex items-center gap-2 justify-center pt-1">
                <Button
                  type="submit"
                  disabled={savingEmail || emailOtp.length !== 6}
                  className="bg-primary text-primary-foreground font-semibold text-xs h-9"
                >
                  {savingEmail ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Verifying...
                    </>
                  ) : (
                    "Verify & Update Email →"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEmailStep("input");
                    setEmailOtp("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground h-9"
                >
                  Back
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. CHANGE PASSWORD (CURRENT + NEW) */}
      {/* ============================================================ */}
      <div className="vault-card p-5 sm:p-6">
        <h3 className="wallet-label mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Change Vault Password
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          To update your password, enter your current password followed by your new password.
        </p>

        <form onSubmit={handleChangePassword} className="space-y-3.5">
          {/* Current Password */}
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-xs font-semibold flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-primary" /> Previous / Current Password
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
                className="bg-secondary border-border min-h-[42px] pr-10 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-semibold flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-primary" /> New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className="bg-secondary border-border min-h-[42px] pr-10 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-new-password" className="text-xs font-semibold flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-primary" /> Confirm New Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-new-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type new password again"
                required
                minLength={6}
                className="bg-secondary border-border min-h-[42px] pr-10 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && confirmPassword && (
              <p className={`text-[11px] mt-1 font-medium ${newPassword === confirmPassword ? "text-primary" : "text-destructive"}`}>
                {newPassword === confirmPassword ? "✓ New passwords match" : "✕ Passwords do not match"}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={
              savingPassword ||
              !currentPassword ||
              newPassword.length < 6 ||
              newPassword !== confirmPassword
            }
            className="w-full sm:w-auto min-h-[42px] bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-[0_0_15px_rgba(57,255,20,0.2)] rounded-xl text-xs mt-2"
          >
            {savingPassword ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Updating Password...
              </>
            ) : (
              "Update Password →"
            )}
          </Button>
        </form>
      </div>

      {/* ============================================================ */}
      {/* 4. ACTIVE SESSION & SIGN OUT */}
      {/* ============================================================ */}
      <div className="vault-card p-5 sm:p-6 flex items-center justify-between">
        <div>
          <h3 className="wallet-label mb-1">Session Management</h3>
          <p className="text-xs text-muted-foreground">Currently signed in as {user?.email}</p>
        </div>
        <Button
          onClick={() => setSignOutOpen(true)}
          variant="outline"
          size="sm"
          className="border-border text-foreground hover:bg-destructive/10 hover:text-destructive text-xs"
        >
          Sign Out
        </Button>
      </div>

      {/* ============================================================ */}
      {/* 5. DANGER ZONE (MOVED FROM SETTINGS) */}
      {/* ============================================================ */}
      <SettingsDangerZone
        resetOpen={resetOpen}
        setResetOpen={setResetOpen}
        resetConfirm={resetConfirm}
        setResetConfirm={setResetConfirm}
        resetting={resetting}
        onReset={handleResetAccount}
      />

      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} onConfirm={signOut} />

      <ProfilePhotoCropperModal
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        imageSrc={rawImageSrc}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}
