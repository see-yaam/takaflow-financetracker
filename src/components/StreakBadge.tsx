import { motion } from "framer-motion";

interface Props {
  streak: number;
}

export default function StreakBadge({ streak }: Props) {
  if (streak <= 0) return null;

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
