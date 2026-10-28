import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Check, X, RotateCcw, Sparkles, ArrowDownLeft, ArrowUpRight, Globe } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseVoiceInput, ParsedVoiceTransaction } from "@/lib/voiceParser";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransaction } from "@/hooks/useTransactions";
import CategoryPicker from "@/components/CategoryPicker";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoiceTransactionModal({ open, onOpenChange }: Props) {
  const { data: wallets } = useWallets();
  const createTx = useCreateTransaction();
  const {
    isListening,
    transcript,
    setTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const [lang, setLang] = useState<"bn-BD" | "en-US">("bn-BD");
  const [parsed, setParsed] = useState<ParsedVoiceTransaction | null>(null);

  // Editable transaction form state
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [walletId, setWalletId] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Set default wallet when available
  useEffect(() => {
    if (wallets && wallets.length > 0 && !walletId) {
      setWalletId(wallets[0].id);
    }
  }, [wallets, walletId]);

  // When modal opens, auto-start speech recognition
  useEffect(() => {
    if (open) {
      setParsed(null);
      resetTranscript();
      if (isSupported) {
        startListening(lang);
      }
    } else {
      stopListening();
    }
  }, [open, lang, isSupported]);

  // When speech stops and transcript exists, parse it
  useEffect(() => {
    if (!isListening && transcript.trim().length > 0) {
      const result = parseVoiceInput(transcript);
      if (result) {
        setParsed(result);
        setType(result.type);
        setAmount(result.amount.toString());
        setCategory(result.category);
        setNote(result.note);
      }
    }
  }, [isListening, transcript]);

  const handleStartAgain = () => {
    setParsed(null);
    resetTranscript();
    startListening(lang);
  };

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!walletId && wallets && wallets.length > 0) {
      setWalletId(wallets[0].id);
    }

    setIsSaving(true);
    try {
      await createTx.mutateAsync({
        wallet_id: walletId || (wallets ? wallets[0].id : ""),
        type,
        amount: num,
        category: category || "Other",
        note: note || (type === "expense" ? "Voice expense" : "Voice income"),
        date: format(new Date(), "yyyy-MM-dd"),
      });

      toast.success(
        `⚡ Recorded ${category}: ৳${num.toLocaleString()} (${type === "expense" ? "Expense" : "Income"})!`,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 bg-card/95 backdrop-blur-xl border-border/60 shadow-2xl rounded-2xl">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Voice Transaction Assistant
          </DialogTitle>
          <div className="flex items-center gap-1.5 bg-secondary/80 px-2 py-1 rounded-lg text-xs">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => {
                const nextLang = lang === "bn-BD" ? "en-US" : "bn-BD";
                setLang(nextLang);
                if (isListening) {
                  stopListening();
                  startListening(nextLang);
                }
              }}
              className="text-[11px] font-medium text-foreground hover:text-primary transition-colors"
            >
              {lang === "bn-BD" ? "বাংলা / বাংলিশ" : "English"}
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Visual Microphone Section */}
          <div className="flex flex-col items-center justify-center pt-2 pb-1">
            <div className="relative flex items-center justify-center">
              {isListening && (
                <>
                  <div className="absolute h-24 w-24 rounded-full bg-primary/20 animate-ping opacity-75" />
                  <div className="absolute h-28 w-28 rounded-full bg-primary/10 animate-pulse" />
                </>
              )}
              <button
                type="button"
                onClick={isListening ? stopListening : handleStartAgain}
                className={`relative z-10 h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                  isListening
                    ? "bg-primary text-primary-foreground scale-105 shadow-primary/30 ring-4 ring-primary/20"
                    : "bg-secondary text-foreground hover:bg-primary/20 hover:text-primary"
                }`}
              >
                {isListening ? (
                  <Mic className="h-7 w-7 animate-pulse" />
                ) : (
                  <MicOff className="h-7 w-7 text-muted-foreground" />
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-medium mt-3 text-center">
              {isListening
                ? "শুনছি... স্বাভাবিকভাবে মুখে বলুন (যেমন: '৪০০ টাকা রেস্টুরেন্টে খরচ')"
                : transcript
                ? "কথা বলা শেষ হয়েছে। নিচে কনফার্ম করুন:"
                : "মাইক্রোফোনে ট্যাপ করে কথা বলুন"}
            </p>
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
                  <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
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
  );
}
