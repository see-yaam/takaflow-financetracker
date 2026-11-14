import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { throwIfSupabaseError } from "@/lib/supabaseErrors";
import { requireOnline } from "@/lib/onlineOnly";

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  /** Amount debited, in the source wallet's currency. */
  amount: number;
  /** Amount credited, in the target wallet's currency (required when currencies differ). */
  convertedAmount?: number;
  date?: string;
  note?: string;
}

/**
 * Wallet-to-wallet transfer as ONE database transaction (transfer_wallet_funds):
 * debit + credit + a linked pair of "Transfer" ledger rows. Either everything
 * happens or nothing does, so money can never vanish between two wallets.
 */
export function useTransferFunds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransferInput) => {
      requireOnline("Transferring between wallets");
      const { data, error } = await supabase.rpc("transfer_wallet_funds", {
        p_from_wallet: input.fromWalletId,
        p_to_wallet: input.toWalletId,
        p_amount: input.amount,
        p_converted_amount: input.convertedAmount,
        p_date: input.date,
        p_note: input.note,
      });
      throwIfSupabaseError(error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
