import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Check, X, RotateCcw, Sparkles, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseVoiceInput, ParsedVoiceTransaction, guessCategoryEmoji } from "@/lib/voiceParser";
import { parseVoiceWithAi } from "@/lib/aiVoiceParser";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useCustomCategories, useCreateCustomCategory } from "@/hooks/useCustomCategories";
import CategoryPicker from "@/components/CategoryPicker";
import InsufficientBalanceModal, { AttemptedExpense } from "@/components/InsufficientBalanceModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoiceTransactionModal({ open, onOpenChange }: Props) {
  const { data: wallets } = useWallets();
  const { data: customCategories } = useCustomCategories();
  const createCustomCategory = useCreateCustomCategory();
  const createTx = useCreateTransaction();
  const {
    isListening,
    transcript,
    setTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const [parsed, setParsed] = useState<ParsedVoiceTransaction | null>(null);

  // Editable transaction form state
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [walletId, setWalletId] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientData, setInsufficientData] = useState<AttemptedExpense | null>(null);

  const [selectedLang, setSelectedLang] = useState<"auto" | "bn-BD" | "en-US">(() => {
    try {
      return (localStorage.getItem("takaflow_voice_lang") as "auto" | "bn-BD" | "en-US") || "auto";
    } catch {
      return "auto";
    }
  });

  const holdStartRef = useRef<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  // Set default wallet when available
  useEffect(() => {
    if (wallets && wallets.length > 0 && !walletId) {
      setWalletId(wallets[0].id);
    }
  }, [wallets, walletId]);

  // When modal opens/closes, reset state
  useEffect(() => {
    if (open) {
      setParsed(null);
      setIsAiParsing(false);
      resetTranscript();
      setIsHolding(false);
    } else {
      stopListening();
    }
  }, [open]);

  const switchLang = (newLang: "auto" | "bn-BD" | "en-US") => {
    setSelectedLang(newLang);
    try {
      localStorage.setItem("takaflow_voice_lang", newLang);
    } catch {}
    resetTranscript();
    setParsed(null);
    if (isListening) {
      startListening(newLang === "en-US" ? "en-US" : "bn-BD");
    }
  };

  // Press and Hold Handlers with pointer capture for mobile stability
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    // If already listening from a previous tap, this click toggles it off
    if (isListening && !isHolding) {
      stopListening();
      holdStartRef.current = null;
      setIsHolding(false);
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(20);
        }
      } catch {}
      return;
    }

    holdStartRef.current = Date.now();
    setIsHolding(true);
    setParsed(null);
    setIsAiParsing(false);
    resetTranscript();
    startListening(selectedLang === "en-US" ? "en-US" : "bn-BD");
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(40);
      }
    } catch {}
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (!holdStartRef.current) return;
    const duration = Date.now() - holdStartRef.current;
    holdStartRef.current = null;
    setIsHolding(false);

    // If held for 220ms or more: Walkie-Talkie mode -> stop immediately when thumb is released!
    if (duration >= 220) {
      stopListening();
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(25);
        }
      } catch {}
    }
    // If quick tap (< 220ms), it remains active in hands-free tap mode
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (holdStartRef.current) {
      holdStartRef.current = null;
      setIsHolding(false);
      stopListening();
    }
  };

  // When speech stops and transcript exists, parse it with existing categories
  useEffect(() => {
    if (!isListening && transcript.trim().length > 0) {
      const existingCatNames = (customCategories || []).map((c) => c.name);
      const result = parseVoiceInput(transcript, existingCatNames);

      const applyParsedData = (res: ParsedVoiceTransaction) => {
        setParsed(res);
        setType(res.type);
        setAmount(res.amount.toString());
        setCategory(res.category);
        setNote(res.note);

        // Auto-select detected wallet if mentioned (e.g. bKash, Cash, Nagad, Bank, Pocket)
        if (res.detectedWallet && wallets && wallets.length > 0) {
          const target = res.detectedWallet.toLowerCase();
          const isCashLike = target === "cash" || target === "pocket";
          const matched =
            wallets.find((w) => w.name.toLowerCase().includes(target)) ||
            wallets.find((w) => target.includes(w.name.toLowerCase())) ||
            (isCashLike
              ? wallets.find((w) => {
                  const n = w.name.toLowerCase();
                  return (
                    n.includes("cash") ||
                    n.includes("pocket") ||
                    n.includes("পকেট") ||
                    n.includes("ক্যাশ") ||
                    n.includes("নগদ") ||
                    n.includes("মানিব্যাগ") ||
                    n.includes("wallet")
                  );
                })
              : undefined);
          if (matched) {
            setWalletId(matched.id);
          }
        }
      };

      if (result) {
        applyParsedData(result);
      } else {
        // Local regex parsing could not extract amount or intent -> Silent AI Fallback!
        setIsAiParsing(true);
        parseVoiceWithAi(transcript, existingCatNames, (wallets || []).map((w) => w.name))
          .then((aiResult) => {
            if (aiResult) {
              applyParsedData(aiResult);
            }
          })
          .catch((err) => {
            console.warn("AI parse fallback error:", err);
          })
          .finally(() => {
            setIsAiParsing(false);
          });
      }
    }
  }, [isListening, transcript, wallets, customCategories]);

  // Check if detected category is new (not in user custom categories or defaults)
  const isNewCategory = useMemo(() => {
    if (!category || category === "Other" || category === "General Expense" || category === "Income") return false;
    const existingNames = (customCategories || []).map((c) => c.name.toLowerCase());
    return !existingNames.includes(category.trim().toLowerCase());
  }, [category, customCategories]);

  const handleStartAgain = () => {
    setParsed(null);
    setIsAiParsing(false);
    resetTranscript();
    startListening(selectedLang);
  };

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const chosenWalletId = walletId || (wallets && wallets.length > 0 ? wallets[0].id : "");
    if (!walletId && chosenWalletId) {
      setWalletId(chosenWalletId);
    }

    // Edge Case Protection: Taka can NEVER be negative!
    if (type === "expense") {
      const selectedWallet = wallets?.find((w) => w.id === chosenWalletId);
      const currentBal = Number(selectedWallet?.balance || 0);

      if (selectedWallet && currentBal < num) {
        setInsufficientData({
          walletId: chosenWalletId,
          amount: num,
          category: category.trim() || "General Expense",
          note: note || "Voice expense",
          date: format(new Date(), "yyyy-MM-dd"),
        });
        setInsufficientOpen(true);
        return;
      }
    }

    setIsSaving(true);
    try {
      const finalCategory = category.trim() || (type === "expense" ? "General Expense" : "Income");

      // Auto-build custom category instantly if it doesn't already exist!
      const existingNames = (customCategories || []).map((c) => c.name.toLowerCase());
      if (
        finalCategory &&
        finalCategory !== "Other" &&
        finalCategory !== "General Expense" &&
        finalCategory !== "Income" &&
        !existingNames.includes(finalCategory.toLowerCase())
      ) {
        try {
          await createCustomCategory.mutateAsync({
            name: finalCategory,
            emoji: guessCategoryEmoji(finalCategory),
          });
        } catch (catErr) {
          console.warn("Could not auto-create custom category:", catErr);
        }
      }

      await createTx.mutateAsync({
        wallet_id: walletId || (wallets ? wallets[0].id : ""),
        type,
        amount: num,
        category: finalCategory,
        note: note || (type === "expense" ? "Voice expense" : "Voice income"),
        date: format(new Date(), "yyyy-MM-dd"),
      });

      toast.success(
        `⚡ Recorded ${finalCategory}: ৳${num.toLocaleString()} (${type === "expense" ? "Expense" : "Income"})!`,
        { duration: 4000 }
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to save transaction: " + (err?.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 bg-card/95 backdrop-blur-xl border-border/60 shadow-2xl rounded-2xl">
        <DialogHeader className="pb-2 border-b border-border/40">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Voice Transaction Assistant
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            মুখে বলুন (বাংলা, বাংলিশ বা ইংলিশ) — অটো ক্যাটাগরি তৈরি হবে
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Language Toggle: Auto (Mixed) vs বাংলা vs English */}
          <div className="flex items-center justify-center p-1 rounded-xl bg-secondary/80 border border-border/50 max-w-[270px] mx-auto">
            <button
              type="button"
              onClick={() => switchLang("auto")}
              className={cn(
                "flex-1 py-1 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                selectedLang === "auto"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Automatically detects Mixed Bangla, Banglish, and English"
            >
              <span>⚡</span> Auto
            </button>
            <button
              type="button"
              onClick={() => switchLang("bn-BD")}
              className={cn(
                "flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                selectedLang === "bn-BD"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>🇧🇩</span> বাংলা
            </button>
            <button
              type="button"
              onClick={() => switchLang("en-US")}
              className={cn(
                "flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                selectedLang === "en-US"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>🇺🇸</span> English
            </button>
          </div>

          {/* Visual Microphone Section */}
          <div className="flex flex-col items-center justify-center pt-2 pb-1">
            <div className="relative flex items-center justify-center">
              {(isListening || isHolding) && (
                <>
                  <div className="absolute h-24 w-24 rounded-full bg-primary/30 animate-ping opacity-75" />
                  <div className="absolute h-32 w-32 rounded-full bg-primary/15 animate-pulse" />
                  <div className="absolute h-40 w-40 rounded-full bg-primary/5 animate-pulse delay-150" />
                </>
              )}
              <button
                type="button"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                className={cn(
                  "relative z-10 h-22 w-22 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl select-none touch-none cursor-pointer",
                  isListening || isHolding
                    ? "bg-primary text-primary-foreground scale-110 shadow-primary/50 ring-8 ring-primary/30"
                    : "bg-secondary text-foreground hover:bg-primary/20 hover:text-primary active:scale-95"
                )}
                title="Press & hold to speak, release to finish"
              >
                {isListening || isHolding ? (
                  <Mic className="h-10 w-10 animate-pulse text-primary-foreground" />
                ) : (
                  <Mic className="h-10 w-10 text-muted-foreground" />
                )}
              </button>
            </div>

            <p className="text-xs font-medium mt-4 text-center transition-colors">
              {isHolding ? (
                <span className="text-primary font-semibold flex items-center justify-center gap-1.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                  আঙুল চেপে ধরে কথা বলুন... ছাড়লে সেভ হবে
                </span>
              ) : isListening ? (
                <span className="text-primary font-semibold flex items-center justify-center gap-1.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                  শুনছি... কথা বলা শেষ হলে ট্যাপ করুন
                </span>
              ) : transcript ? (
                <span className="text-foreground">কথা বলা শেষ হয়েছে। নিচে কনফার্ম করুন:</span>
              ) : (
                <span className="text-muted-foreground flex items-center justify-center gap-1.5">
                  🎙️ <b>চেপে ধরে রাখুন (Hold)</b> কথা বলতে • অথবা ট্যাপ করুন
                </span>
              )}
            </p>

            {error && (
              <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-center max-w-xs">
                <p className="text-xs text-destructive font-medium">
                  {error}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  💡 ফোনের <b>Settings &gt; Apps &gt; TakaFlow &gt; Permissions</b> থেকে <b>Microphone</b> চালু করুন।
                </p>
              </div>
            )}
          </div>

          {/* Live Transcript Bubble */}
          {transcript && (
            <div className="p-3 rounded-xl bg-secondary/60 border border-border/40 text-center">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-0.5 font-semibold">
                Spoken Input
              </span>
              <p className="text-sm font-medium text-foreground italic">
                "{transcript}"
              </p>
            </div>
          )}

          {/* Parsed Confirmation Card */}
          {parsed ? (
            <div className="space-y-3.5 p-4 rounded-xl bg-card border border-primary/30 shadow-sm animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Transaction Preview</span>
                {/* Type Toggle */}
                <div className="flex items-center bg-secondary p-0.5 rounded-lg border border-border/50">
                  <button
                    type="button"
                    onClick={() => setType("expense")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      type === "expense"
                        ? "bg-rose-500/20 text-rose-500 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ArrowDownLeft className="h-3 w-3" />
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("income")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      type === "income"
                        ? "bg-emerald-500/20 text-emerald-500 shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    Income
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Amount (টাকা)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    ৳
                  </span>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7 text-lg font-bold h-11 bg-secondary/50 border-border/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Category Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground block">Category</Label>
                    {isNewCategory && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded animate-pulse">
                        <Sparkles className="w-2.5 h-2.5" /> Auto-built
                      </span>
                    )}
                  </div>
                  <CategoryPicker value={category} onChange={setCategory} />
                </div>

                {/* Wallet Selector */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Wallet</Label>
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger className="h-10 text-xs bg-secondary/50 border-border/60">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {(wallets || []).map((w) => (
                        <SelectItem key={w.id} value={w.id} className="text-xs">
                          {w.name} (৳{w.balance.toLocaleString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Note Input */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Note</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Restaurant bill"
                  className="h-9 text-xs bg-secondary/50 border-border/60"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleStartAgain}
                  className="flex-1 text-xs gap-1 h-10 border-border/60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Speak Again
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 text-xs font-semibold gap-1.5 h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Confirm & Save"}
                </Button>
              </div>
            </div>
          ) : isAiParsing ? (
            <div className="text-center py-4 space-y-2">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs text-muted-foreground font-medium">
                প্রসেস করা হচ্ছে...
              </p>
            </div>
          ) : (
            !isListening && transcript.trim().length > 0 && (
              <div className="text-center py-2 space-y-2">
                <p className="text-xs text-amber-500 font-medium">
                  টাকার পরিমাণ সঠিকভাবে বোঝা যায়নি। দয়া করে আবার বলুন (যেমন: '৫০০ টাকা বাজার')
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleStartAgain}
                  className="text-xs gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try Again
                </Button>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>

    <InsufficientBalanceModal
      open={insufficientOpen}
      onOpenChange={setInsufficientOpen}
      attemptedExpense={insufficientData}
      onSuccess={() => onOpenChange(false)}
    />
  </>
  );
}
