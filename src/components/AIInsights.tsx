import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface Insight {
  icon: string;
  title: string;
  description: string;
}

interface Props {
  summary: {
    totalIncome: number;
    totalExpense: number;
    net: number;
    categories: Record<string, number>;
    month: string;
  };
  previousMonth?: {
    totalIncome: number;
    totalExpense: number;
    categories: Record<string, number>;
  };
}

export default function AIInsights({ summary, previousMonth }: Props) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-insights", {
        body: { summary, previousMonth },
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
            <Sparkles className="h-3 w-3" /> AI Spending Insights
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Get personalized spending analysis powered by AI.</p>
        <Button onClick={fetchInsights} className="bg-primary/15 text-primary hover:bg-primary/25 border-0">
          <Sparkles className="h-4 w-4 mr-2" /> Generate Insights
        </Button>
      </div>
    );
  }

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4 flex items-center gap-2">
        <Sparkles className="h-3 w-3" /> AI Spending Insights
      </h3>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 items-start">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
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
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-3 items-start p-3 rounded-xl bg-secondary/50 border border-border/30"
            >
              <span className="text-xl shrink-0">{insight.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
