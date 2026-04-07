import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, BarChart3, Target, TrendingUp, Lightbulb } from "lucide-react";

interface Insight {
  type: "comparison" | "budget" | "forecast" | "advice";
  title: string;
  message: string;
}

interface Transaction {
  date: string;
  amount: number;
  category: string;
  type: string;
}

interface Props {
  currentTransactions: Transaction[];
  previousTransactions: Transaction[];
  budget: number | null;
  currentDate: string;
  daysLeft: number;
  dailyAvgSpend: number;
  prevDailyAvgSpend: number;
}

const INSIGHT_CONFIG: Record<string, { icon: typeof BarChart3; bgClass: string; iconClass: string }> = {
  comparison: { icon: BarChart3, bgClass: "bg-blue-500/10 border-blue-500/20", iconClass: "text-blue-500" },
  budget: { icon: Target, bgClass: "bg-emerald-500/10 border-emerald-500/20", iconClass: "text-emerald-500" },
  forecast: { icon: TrendingUp, bgClass: "bg-amber-500/10 border-amber-500/20", iconClass: "text-amber-500" },
  advice: { icon: Lightbulb, bgClass: "bg-green-500/10 border-green-500/20", iconClass: "text-green-500" },
};

export default function AIInsights({
  currentTransactions,
  previousTransactions,
  budget,
  currentDate,
  daysLeft,
  dailyAvgSpend,
  prevDailyAvgSpend,
}: Props) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-insights", {
        body: {
          currentTransactions: currentTransactions.map((t) => ({
            date: t.date,
            amount: t.amount,
            category: t.category,
            type: t.type,
          })),
          previousTransactions: previousTransactions.map((t) => ({
            date: t.date,
            amount: t.amount,
            category: t.category,
            type: t.type,
          })),
          budget,
          currentDate,
          daysLeft,
          dailyAvgSpend: dailyAvgSpend.toFixed(2),
          prevDailyAvgSpend: prevDailyAvgSpend.toFixed(2),
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setInsights(data?.insights || []);
      setFetched(true);
    } catch (e: any) {
      setError(e.message || "Failed to get insights");
    }
    setLoading(false);
  };

  if (!fetched && !loading) {
    return (
      <div className="vault-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="wallet-label flex items-center gap-2">
            <Sparkles className="h-3 w-3" /> AI Financial Analysis
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Get data-driven spending analysis with specific numbers and actionable recommendations.
        </p>
        <Button onClick={fetchInsights} className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
          <Sparkles className="h-4 w-4 mr-2" /> Analyze My Spending
        </Button>
      </div>
    );
  }

  return (
    <div className="vault-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="wallet-label flex items-center gap-2">
          <Sparkles className="h-3 w-3" /> AI Financial Analysis
        </h3>
        {fetched && (
          <Button onClick={fetchInsights} size="sm" variant="ghost" className="text-xs text-muted-foreground">
            Refresh
          </Button>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-border/30 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          {error}
          <Button onClick={fetchInsights} variant="outline" size="sm" className="ml-3 border-border">
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((insight, i) => {
            const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.advice;
            const Icon = config.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`p-4 rounded-xl border ${config.bgClass}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${config.bgClass}`}>
                    <Icon className={`h-4 w-4 ${config.iconClass}`} />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{insight.message}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
