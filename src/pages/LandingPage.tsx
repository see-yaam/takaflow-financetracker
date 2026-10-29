import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Wallet, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Calendar, 
  Target, 
  Handshake, 
  TrendingUp, 
  Smartphone, 
  Lock, 
  Sparkles, 
  ChevronRight,
  CreditCard,
  Banknote,
  PiggyBank,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import CurrencyDoodles from "@/components/CurrencyDoodles";

export default function LandingPage() {
  const { user } = useAuth();
  const [activeDemoTab, setActiveDemoTab] = useState<"wallets" | "calendar" | "debts" | "goals">("wallets");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary relative overflow-x-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/10 blur-[130px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-[600px] right-[-100px] w-[500px] h-[400px] bg-accent/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-lg shadow-[0_0_15px_rgba(57,255,20,0.25)]">
              ৳
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight text-foreground flex items-center gap-1.5">
                TakaFlow
                <span className="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                  Vault
                </span>
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground font-medium">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#demo" className="hover:text-foreground transition-colors">Interactive Demo</a>
            <a href="#comparison" className="hover:text-foreground transition-colors">Why TakaFlow</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {user ? (
              <Button asChild size="sm" className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.3)] text-xs sm:text-sm">
                <Link to="/">
                  Enter Vault <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild size="sm" className="text-xs sm:text-sm font-medium hover:text-foreground px-2 sm:px-3">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild size="sm" className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-[0_0_20px_rgba(57,255,20,0.25)] text-xs sm:text-sm px-2.5 sm:px-4">
                  <Link to="/signup">
                    <span>Get Started</span>
                    <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 md:pt-20 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full text-center">
        {/* Currency doodles effect */}
        <CurrencyDoodles />

        {/* Top Tagline Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-secondary/80 border border-primary/30 text-xs sm:text-sm text-primary mb-6 shadow-[0_0_20px_rgba(57,255,20,0.1)]">
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span>Built for Bangladesh • bKash • Nagad • Banks • Cash</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.15]">
          Master your money across <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-primary via-emerald-400 to-accent bg-clip-text text-transparent">
            every wallet you own.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Stop wondering where your salary vanished. TakaFlow is your private financial command center to track daily expenses, manage debts (ধার/দেনা), and achieve your savings targets with zero clutter.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto h-12 px-8 text-base bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_25px_rgba(57,255,20,0.35)] transition-all">
            <Link to={user ? "/" : "/signup"}>
              {user ? "Go to Your Dashboard" : "Open Your Free Vault"} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-12 px-6 text-base border-border/80 hover:bg-secondary/60">
            <a href="#demo">Explore Live Preview</a>
          </Button>
        </div>

        {/* Social Proof Stats */}
        <div className="mt-12 pt-8 border-t border-border/40 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-primary">৳0</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">100% Free Forever</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground">100%</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Private & Encrypted</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-primary">&lt; 3s</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Quick Log Time</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground">All In 1</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">MFS, Banks & Cash</div>
          </div>
        </div>
      </section>

      {/* Interactive Mock Dashboard Preview Section */}
      <section id="demo" className="py-12 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        <div className="text-center mb-8">
          <h2 className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">Live Interactive Preview</h2>
          <p className="text-2xl sm:text-3xl font-bold">See what your financial clarity looks like</p>
        </div>

        {/* Tab Controls for Demo */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <button
            onClick={() => setActiveDemoTab("wallets")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeDemoTab === "wallets"
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(57,255,20,0.25)]"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            💳 Multi-Wallets
          </button>
          <button
            onClick={() => setActiveDemoTab("calendar")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeDemoTab === "calendar"
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(57,255,20,0.25)]"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            🗓️ Budget Calendar
          </button>
          <button
            onClick={() => setActiveDemoTab("debts")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeDemoTab === "debts"
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(57,255,20,0.25)]"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            🤝 Dhar & Debts
          </button>
          <button
            onClick={() => setActiveDemoTab("goals")}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeDemoTab === "goals"
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(57,255,20,0.25)]"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            🎯 Savings Goals
          </button>
        </div>

        {/* Mock Window Container */}
        <div className="vault-card p-4 sm:p-6 md:p-8 border border-primary/25 shadow-[0_0_50px_rgba(57,255,20,0.08)] bg-card/90 backdrop-blur-sm">
          {/* Mock Browser Header Dots */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-destructive/60" />
              <div className="h-3 w-3 rounded-full bg-accent/60" />
              <div className="h-3 w-3 rounded-full bg-primary/60" />
              <span className="ml-2 font-mono text-[11px] opacity-70">vault.takaflow.app/dashboard</span>
            </div>
            <div className="flex items-center gap-1.5 text-primary text-[11px] font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-ping" />
              Vault Active
            </div>
          </div>

          {/* TAB 1: Wallets Preview */}
          {activeDemoTab === "wallets" && (
            <div className="space-y-6">
              {/* Total Balance Hero Banner */}
              <div className="p-6 rounded-2xl bg-secondary/40 border border-border/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">Total Liquid Net Worth</span>
                  <div className="text-3xl sm:text-4xl md:text-5xl font-bold font-mono tracking-tight text-foreground mt-1">
                    ৳ 1,48,750.<span className="text-muted-foreground text-2xl">00</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-mono text-primary flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> +৳ 24,500 this month
                  </div>
                </div>
              </div>

              {/* Wallet Chips Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">bKash Personal</span>
                    <Smartphone className="h-4 w-4 text-accent" />
                  </div>
                  <div className="text-xl font-bold font-mono text-primary">৳ 18,250.00</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Daily expenses</div>
                </div>

                <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">City Bank (Salary)</span>
                    <CreditCard className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">৳ 82,500.00</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Primary banking</div>
                </div>

                <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">Pocket Cash</span>
                    <Banknote className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">৳ 6,000.00</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Physical wallet</div>
                </div>

                <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">Emergency Fund</span>
                    <PiggyBank className="h-4 w-4 text-accent" />
                  </div>
                  <div className="text-xl font-bold font-mono text-foreground">৳ 42,000.00</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Untouched reserve</div>
                </div>
              </div>

              {/* Recent Transactions List */}
              <div className="pt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
                  Recent Vault Activity
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        +
                      </div>
                      <div>
                        <div className="text-sm font-medium">Software Engineering Salary</div>
                        <div className="text-xs text-muted-foreground">City Bank • Yesterday</div>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-primary">+৳ 85,000.00</div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive font-bold text-xs">
                        -
                      </div>
                      <div>
                        <div className="text-sm font-medium">Monthly Groceries (Swapno)</div>
                        <div className="text-xs text-muted-foreground">bKash Personal • Today</div>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-destructive">-৳ 4,850.00</div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive font-bold text-xs">
                        -
                      </div>
                      <div>
                        <div className="text-sm font-medium">Fiber Internet Bill</div>
                        <div className="text-xs text-muted-foreground">bKash Personal • 3 days ago</div>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-destructive">-৳ 1,200.00</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Calendar Preview */}
          {activeDemoTab === "calendar" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Monthly Budget Target: <strong className="text-foreground">৳40,000</strong></span>
                <span className="text-primary font-mono font-medium">Spent: ৳28,450 (Within safe limit)</span>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center text-xs">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-muted-foreground font-mono py-1">{day}</div>
                ))}
                {Array.from({ length: 14 }).map((_, i) => {
                  const dayNum = i + 1;
                  const hasExpense = [3, 7, 10, 12, 14].includes(dayNum);
                  const amount = dayNum === 3 ? "৳850" : dayNum === 7 ? "৳3,200" : dayNum === 10 ? "৳450" : dayNum === 12 ? "৳6,100" : "৳1,150";
                  return (
                    <div
                      key={dayNum}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-between min-h-[58px] transition-all ${
                        hasExpense 
                          ? "bg-secondary/40 border-primary/20 text-foreground" 
                          : "bg-secondary/10 border-border/20 text-muted-foreground opacity-60"
                      }`}
                    >
                      <span className="font-mono text-[10px]">{dayNum}</span>
                      {hasExpense && (
                        <span className="text-[10px] font-mono text-accent font-bold mt-1">{amount}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Clicking any date displays exact receipts, transaction timestamps, and category breakdowns.
              </p>
            </div>
          )}

          {/* TAB 3: Debts Preview */}
          {activeDemoTab === "debts" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-xs text-primary font-medium">You Lent (People owe you)</span>
                  <div className="text-2xl font-bold font-mono text-primary mt-1">৳ 14,000.00</div>
                </div>
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <span className="text-xs text-destructive font-medium">You Borrowed (You owe)</span>
                  <div className="text-2xl font-bold font-mono text-destructive mt-1">৳ 5,000.00</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/40 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    Tanvir Ahmed <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Lent</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Original: ৳20,000 • Repaid: ৳10,000</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-primary">৳ 10,000 remaining</div>
                  <span className="text-[11px] text-muted-foreground">Due Nov 15</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/40 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    Rafiqul Islam <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">Borrowed</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Emergency laptop repair advance</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-destructive">৳ 5,000 remaining</div>
                  <span className="text-[11px] text-muted-foreground">Settled partially</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Goals Preview */}
          {activeDemoTab === "goals" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💻</span>
                    <span className="font-semibold text-sm">MacBook M3 Fund</span>
                  </div>
                  <span className="text-xs font-mono text-primary font-bold">72% Saved</span>
                </div>
                <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden mb-2">
                  <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: "72%" }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>Saved: ৳1,08,000</span>
                  <span>Target: ৳1,50,000</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-secondary/30 border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏖️</span>
                    <span className="font-semibold text-sm">Cox's Bazar Winter Trip</span>
                  </div>
                  <span className="text-xs font-mono text-accent font-bold">45% Saved</span>
                </div>
                <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden mb-2">
                  <div className="bg-accent h-full rounded-full transition-all duration-500" style={{ width: "45%" }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>Saved: ৳13,500</span>
                  <span>Target: ৳30,000</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-xs uppercase tracking-widest text-accent font-bold mb-2">Engineered for Daily Life</h2>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to master your Taka</p>
          <p className="text-muted-foreground text-sm sm:text-base mt-3">
            Designed specifically around the way people in Bangladesh earn, spend, lend, and save.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
              <Wallet className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Multi-Wallet Ecosystem</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Track bKash, Nagad, Rocket, Bank accounts, and physical Cash independently. Real-time balance calculations with automated adjustments.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-4">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Interactive Budget Calendar</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              See your daily spending heatmap on an intuitive calendar view. Spot high-expense spikes and stay comfortably under your monthly cap.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
              <Handshake className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Dhar & Loan Management</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Never forget who borrowed money from you or whom you need to repay. Record partial settlements, payment logs, and borrower notes.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-4">
              <Target className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Visual Savings Goals</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Define dedicated savings pots with emojis and target deadlines. Watch your progress bar fill up as you allocate funds.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Recurring Subscriptions & Bills</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Auto-apply recurring transactions like house rent, electricity, Wi-Fi bills, and gym memberships on their fixed monthly dates.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="vault-card p-6 border border-border/60 hover:border-primary/50 transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 mb-4">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold mb-2">Zero-Access Private Vault</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Protected by PostgreSQL Row-Level Security. We never ask for your bank credentials or SMS OTPs. Your data is 100% yours.
            </p>
          </div>
        </div>
      </section>

      {/* Why TakaFlow vs Generic Apps / Excel Comparison Table */}
      <section id="comparison" className="py-16 px-4 sm:px-6 max-w-4xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">The Difference</h2>
          <p className="text-2xl sm:text-3xl font-bold">Why TakaFlow vs Excel or Western Apps</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/30">
                <th className="p-4 font-semibold text-muted-foreground">Feature</th>
                <th className="p-4 font-bold text-primary">TakaFlow</th>
                <th className="p-4 font-medium text-muted-foreground">Spreadsheets (Excel)</th>
                <th className="p-4 font-medium text-muted-foreground">Foreign Apps (YNAB/Mint)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              <tr>
                <td className="p-4 font-medium">BDT Native & MFS (bKash/Nagad)</td>
                <td className="p-4 text-primary font-bold flex items-center gap-1.5"><Check className="h-4 w-4" /> Built-in</td>
                <td className="p-4 text-muted-foreground">Manual formulas</td>
                <td className="p-4 text-destructive flex items-center gap-1.5"><X className="h-4 w-4" /> USD-focused</td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Dhar / Loan Tracking (ধার খাতা)</td>
                <td className="p-4 text-primary font-bold flex items-center gap-1.5"><Check className="h-4 w-4" /> Native Module</td>
                <td className="p-4 text-muted-foreground">Hard to maintain</td>
                <td className="p-4 text-destructive flex items-center gap-1.5"><X className="h-4 w-4" /> Not supported</td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Visual Budget Calendar Heatmap</td>
                <td className="p-4 text-primary font-bold flex items-center gap-1.5"><Check className="h-4 w-4" /> Yes</td>
                <td className="p-4 text-destructive flex items-center gap-1.5"><X className="h-4 w-4" /> No</td>
                <td className="p-4 text-muted-foreground">Rarely available</td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Privacy / No Bank Credentials Needed</td>
                <td className="p-4 text-primary font-bold flex items-center gap-1.5"><Check className="h-4 w-4" /> 100% Safe</td>
                <td className="p-4 text-primary font-medium flex items-center gap-1.5"><Check className="h-4 w-4" /> Safe</td>
                <td className="p-4 text-destructive flex items-center gap-1.5"><X className="h-4 w-4" /> Requires Plaid/Bank</td>
              </tr>
              <tr>
                <td className="p-4 font-medium">Cost / Subscription</td>
                <td className="p-4 text-primary font-bold">100% Free</td>
                <td className="p-4 text-muted-foreground">Free</td>
                <td className="p-4 text-destructive font-mono">$15 / month</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 px-4 sm:px-6 max-w-3xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-xs uppercase tracking-widest text-accent font-bold mb-2">Got Questions?</h2>
          <p className="text-2xl sm:text-3xl font-bold">Frequently Asked Questions</p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-3">
          <AccordionItem value="item-1" className="vault-card px-4 border border-border/50">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              Is TakaFlow completely free to use?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Yes, 100% free with no hidden charges, trial periods, or annoying banner advertisements. You get full access to all wallets, calendar tracking, debt logs, and savings goals.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2" className="vault-card px-4 border border-border/50">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              Does TakaFlow connect to my bank or ask for OTPs?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              <strong>Never.</strong> TakaFlow is a zero-trust, privacy-first personal vault. We never ask for your bank logins, card CVVs, or SMS OTP codes. You manually enter transactions in two clicks, keeping your bank accounts 100% insulated and secure.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3" className="vault-card px-4 border border-border/50">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              Can I use TakaFlow on my smartphone?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Yes! TakaFlow is built with responsive mobile-first architecture. You can open it in Chrome or Safari on your phone and tap <em>"Add to Home Screen"</em> to use it just like a native app with quick mobile navigation.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4" className="vault-card px-4 border border-border/50">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              Where is my data stored?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Your financial data is hosted in an isolated PostgreSQL database powered by Supabase with Row Level Security (RLS). Only your authenticated session holds the credentials to query or view your financial records.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5" className="vault-card px-4 border border-border/50">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">
              What if I make a mistake while logging an expense?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              TakaFlow supports 1-tap transaction reversal and editing. When you reverse or delete a transaction, your wallet balance automatically recalculates backwards without messing up your ledger.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Call to Action Banner */}
      <section className="py-16 px-4 sm:px-6 max-w-4xl mx-auto w-full text-center">
        <div className="vault-card p-8 sm:p-12 border border-primary/40 relative overflow-hidden bg-gradient-to-b from-secondary/50 to-card">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none" />
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ready to take total control of your money?
          </h2>
          <p className="mt-4 text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            Open your secure vault in under 60 seconds and experience real financial clarity.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="w-full sm:w-auto px-8 h-12 bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-[0_0_25px_rgba(57,255,20,0.35)]">
              <Link to={user ? "/" : "/signup"}>
                {user ? "Open Your Vault →" : "Create Free Account →"}
              </Link>
            </Button>
            {!user && (
              <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto text-sm">
                <Link to="/login">Already have an account? Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 bg-secondary/20 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
              ৳
            </div>
            <span className="font-semibold text-foreground">TakaFlow</span>
            <span>— Personal Finance Vault for Bangladesh</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">Register</Link>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>

          <div>
            © {new Date().getFullYear()} TakaFlow. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
