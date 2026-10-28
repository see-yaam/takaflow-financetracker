import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapSupabaseError } from "@/lib/supabaseErrors";
import { Camera, Trash2, Check, Pencil, X, Loader2 } from "lucide-react";

interface SettingsAccountSectionProps {
  onSignOutClick: () => void;
}

export default function SettingsAccountSection({ onSignOutClick }: SettingsAccountSectionProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);

  const avatarUrl = user?.user_metadata?.avatar_url;
  const fullName = user?.user_metadata?.full_name;

  // Handle Profile Photo Upload (Max 5MB)
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 5MB Limit Check
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("Image size exceeds 5MB limit. Please select a smaller photo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file (PNG, JPG, WebP).");
      return;
    }

    setUploading(true);

    try {
      // Compress & Convert to Data URL (360x360 avatar)
      const reader = new FileReader();
      reader.onload = async (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const MAX_DIM = 360;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

          const { error } = await supabase.auth.updateUser({
            data: {
              ...user?.user_metadata,
              avatar_url: compressedDataUrl,
            },
          });

          if (error) throw error;
          toast.success("Profile photo updated successfully!");
          setUploading(false);
        };
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(mapSupabaseError(err));
      setUploading(false);
    }
  };

  // Remove Profile Photo
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

  // Update Full Name
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

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4">Vault Account & Profile</h3>
      
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        {/* Profile Picture with Camera action */}
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

            {/* Hover Camera Icon Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </div>

          {/* Remove Photo Badge */}
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
            accept="image/*"
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

      <div className="pt-3 border-t border-border/40 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Session active</span>
        <Button
          onClick={onSignOutClick}
          variant="outline"
          size="sm"
          className="border-border text-foreground hover:bg-destructive/10 hover:text-destructive text-xs"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
