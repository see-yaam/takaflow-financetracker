import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency = "BDT"): string {
  const isNegative = amount < 0;
  const absFormatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = isNegative ? "-" : "";
  if (currency === "BDT" || !currency) {
    return `${prefix}৳${absFormatted}`;
  }
  return `${prefix}${currency} ${absFormatted}`;
}
