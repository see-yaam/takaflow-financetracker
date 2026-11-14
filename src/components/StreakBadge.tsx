import { motion } from "framer-motion";

interface Props {
  streak: number;
  /** Small inline chip (e.g. next to a heading) instead of a card. */
  compact?: boolean;
}

export default function StreakBadge({ streak, compact }: Props) {
  if (streak <= 0) return null;
  if (compact) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500" title={`${streak}-day logging streak`}>
        🔥 {streak}
      </span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="vault-card p-4 flex items-center gap-3"
    >
      <span className="text-2xl">🔥</span>
      <div>
        <p className="text-sm font-bold text-foreground">{streak} Day Streak!</p>
        <p className="text-xs text-muted-foreground">Keep logging to build your streak</p>
      </div>
    </motion.div>
  );
}
