import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AppUpdater, checkGitHubRelease, isNewerVersion, GitHubRelease } from "@/lib/appUpdater";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react";

export default function UpdateCheckerModal() {
  const [open, setOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("1.0.6");
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Only perform native auto-update checking on Android device / emulator
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    let isMounted = true;

    async function checkForUpdates() {
      try {
        let activeVer = "1.0.6";
        try {
          const info = await AppUpdater.getAppVersion();
          if (info?.versionName) {
            activeVer = info.versionName;
            if (isMounted) setCurrentVersion(info.versionName);
          }
        } catch (e) {
          console.warn("Could not retrieve native version:", e);
        }

        const release = await checkGitHubRelease();
        if (!release || !isMounted) return;

        const isNewer = isNewerVersion(activeVer, release.tag_name);
        if (isNewer) {
          setLatestRelease(release);
          setOpen(true);
        }
      } catch (err) {
        console.warn("Update check error:", err);
      }
    }

    // Check on startup with 2.5s slight delay so main UI finishes mounting smoothly
    const timer = setTimeout(checkForUpdates, 2500);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleStartUpdate = async () => {
    if (!latestRelease) return;
    const apkAsset = latestRelease.assets.find((a) => a.name.endsWith(".apk")) || {
      browser_download_url: `https://github.com/see-yaam/takaflow-financetracker/releases/download/${latestRelease.tag_name}/TakaFlow.apk`,
    };

    setDownloading(true);
    toast.info("TakaFlow নতুন ভার্সন ডাউনলোড শুরু হচ্ছে...");

    try {
      await AppUpdater.downloadAndInstall({ url: apkAsset.browser_download_url });
      toast.success("ডাউনলোড সম্পন্ন হলে স্ক্রিনে ইনস্টল প্রম্পট আসবে!");
    } catch (err: any) {
      console.error("Update failed:", err);
      if (err?.message === "INSTALL_PERMISSION_REQUIRED" || err === "INSTALL_PERMISSION_REQUIRED") {
        toast.warning("দয়া করে TakaFlow-কে 'Install unknown apps' পারমিশন দিন, তারপর আবার ট্যাপ করুন।");
      } else {
        toast.error("আপডেট ডাউনলোড ব্যর্থ হয়েছে: " + (err?.message || err));
      }
      setDownloading(false);
    }
  };

  if (!open || !latestRelease) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !downloading && setOpen(v)}>
      <DialogContent className="sm:max-w-md p-6 bg-card/95 backdrop-blur-xl border-primary/40 shadow-2xl rounded-2xl">
        <DialogHeader className="pb-2 border-b border-border/40">
          <div className="flex items-center gap-2 text-primary font-bold">
            <span className="h-8 w-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-lg font-bold">
              ৳
            </span>
            <DialogTitle className="text-base sm:text-lg">নতুন আপডেট এসেছে! 🎉</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            আপনার বর্তমান ভার্সন: <b>v{currentVersion}</b> → নতুন ভার্সন: <b>{latestRelease.tag_name}</b>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3.5 rounded-xl bg-secondary/60 border border-border/40 space-y-2">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> আপডেটের নতুন সুবিধাসমূহ
            </span>
            <div className="text-xs text-foreground/90 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto pr-1">
              {latestRelease.body || "পারফরম্যান্স ও বাগ ফিক্স করা হয়েছে।"}
            </div>
          </div>

          {downloading && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin" />
              ব্যাকগ্রাউন্ডে ডাউনলোড হচ্ছে... শেষ হলে স্বয়ংক্রিয় ইনস্টল ডায়ালগ আসবে।
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 justify-end sm:justify-end pt-2">
          {!downloading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              পরে করব
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            disabled={downloading}
            onClick={handleStartUpdate}
            className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 text-xs gap-1.5 px-4 shadow-[0_0_15px_rgba(57,255,20,0.25)]"
          >
            {downloading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ডাউনলোড হচ্ছে...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                এখনই আপডেট করুন
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
