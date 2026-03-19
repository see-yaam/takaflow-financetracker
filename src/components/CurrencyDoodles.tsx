import { useMemo } from "react";
import { motion } from "framer-motion";

const symbols = ["৳", "$", "€", "£"];

interface Doodle {
  symbol: string;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  rotation: number;
}

export default function CurrencyDoodles() {
  const doodles = useMemo<Doodle[]>(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      symbol: symbols[i % symbols.length],
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 40 + Math.random() * 80,
      duration: 12 + Math.random() * 10,
      delay: Math.random() * -20,
      rotation: Math.random() * 360,
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {doodles.map((d, i) => (
        <motion.span
          key={i}
          className="absolute font-bold select-none"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            fontSize: `${d.size}px`,
            color: "#39ff14",
            opacity: 0.04,
            rotate: d.rotation,
          }}
          animate={{
            y: [0, -60, 0],
            opacity: [0.03, 0.05, 0.03],
          }}
          transition={{
            duration: d.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: d.delay,
          }}
        >
          {d.symbol}
        </motion.span>
      ))}
    </div>
  );
}
