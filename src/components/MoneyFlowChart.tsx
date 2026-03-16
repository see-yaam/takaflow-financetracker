import { useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

const COLORS = [
  "hsl(152,38%,52%)", "hsl(29,87%,67%)", "hsl(200,60%,50%)",
  "hsl(280,40%,60%)", "hsl(50,80%,55%)", "hsl(330,50%,55%)",
  "hsl(16,72%,61%)", "hsl(170,50%,45%)",
];

export default function MoneyFlowChart({ incomeByCategory, expenseByCategory }: Props) {
  const data = useMemo(() => {
    const incomeItems = Object.entries(incomeByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const expenseItems = Object.entries(expenseByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalIncome = incomeItems.reduce((s, i) => s + i.value, 0);
    const totalExpense = expenseItems.reduce((s, i) => s + i.value, 0);

    return { incomeItems, expenseItems, totalIncome, totalExpense };
  }, [incomeByCategory, expenseByCategory]);

  if (data.totalIncome === 0 && data.totalExpense === 0) return null;

  const maxTotal = Math.max(data.totalIncome, data.totalExpense, 1);
  const chartHeight = 300;
  const barWidth = 60;

  const renderBars = (items: { name: string; value: number }[], total: number, side: "left" | "right") => {
    let yOffset = 0;
    return items.map((item, i) => {
      const height = (item.value / maxTotal) * chartHeight;
      const y = yOffset;
      yOffset += height + 2;
      const color = COLORS[i % COLORS.length];

      return (
        <motion.g key={item.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
          <rect
            x={side === "left" ? 0 : 0}
            y={y}
            width={barWidth}
            height={Math.max(height, 2)}
            fill={color}
            rx={4}
          />
          <text
            x={side === "left" ? barWidth + 8 : -8}
            y={y + Math.max(height, 2) / 2 + 4}
            fill="hsl(155,20%,60%)"
            fontSize={10}
            textAnchor={side === "left" ? "start" : "end"}
          >
            {item.name} (৳{item.value.toLocaleString()})
          </text>
        </motion.g>
      );
    });
  };

  const svgWidth = 500;
  const leftX = 20;
  const rightX = svgWidth - barWidth - 20;

  return (
    <div className="vault-card p-5">
      <h3 className="wallet-label mb-4">Money Flow</h3>
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={chartHeight + 40} viewBox={`0 0 ${svgWidth} ${chartHeight + 40}`} className="w-full">
          {/* Labels */}
          <text x={leftX} y={15} fill="hsl(152,38%,52%)" fontSize={11} fontWeight={600}>INCOME</text>
          <text x={rightX + barWidth} y={15} fill="hsl(16,72%,61%)" fontSize={11} fontWeight={600} textAnchor="end">EXPENSE</text>

          {/* Income bars */}
          <g transform={`translate(${leftX}, 25)`}>
            {renderBars(data.incomeItems, data.totalIncome, "left")}
          </g>

          {/* Flow lines */}
          {data.incomeItems.length > 0 && data.expenseItems.length > 0 && (
            <g opacity={0.15}>
              {data.incomeItems.map((inc, ii) => {
                let iy = 0;
                for (let k = 0; k < ii; k++) iy += (data.incomeItems[k].value / maxTotal) * chartHeight + 2;
                const ih = (inc.value / maxTotal) * chartHeight;

                return data.expenseItems.map((exp, ei) => {
                  let ey = 0;
                  for (let k = 0; k < ei; k++) ey += (data.expenseItems[k].value / maxTotal) * chartHeight + 2;
                  const eh = (exp.value / maxTotal) * chartHeight;

                  const flow = (inc.value / data.totalIncome) * (exp.value / data.totalExpense) * Math.min(data.totalIncome, data.totalExpense);
                  if (flow < 1) return null;

                  return (
                    <path
                      key={`${ii}-${ei}`}
                      d={`M ${leftX + barWidth} ${25 + iy + ih / 2} C ${svgWidth / 2} ${25 + iy + ih / 2}, ${svgWidth / 2} ${25 + ey + eh / 2}, ${rightX} ${25 + ey + eh / 2}`}
                      stroke="hsl(152,38%,52%)"
                      strokeWidth={Math.max(flow / maxTotal * chartHeight * 0.3, 1)}
                      fill="none"
                    />
                  );
                });
              })}
            </g>
          )}

          {/* Expense bars */}
          <g transform={`translate(${rightX}, 25)`}>
            {renderBars(data.expenseItems, data.totalExpense, "right")}
          </g>
        </svg>
      </div>
    </div>
  );
}
