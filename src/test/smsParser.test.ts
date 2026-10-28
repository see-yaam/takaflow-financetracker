import { describe, it, expect } from "vitest";
import { parseBangladeshFinancialSms } from "@/lib/smsParser";

describe("Universal Bangladesh SMS Parser", () => {
  it("parses bKash merchant payment", () => {
    const sms = "Payment of Tk 120.00 to Shawarma House successful. Ref: dinner. TrxID 9K48FL29 at 28/10/2026 14:30. Balance Tk 4,500.00.";
    const result = parseBangladeshFinancialSms(sms, "bKash");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("bKash");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(120.0);
    expect(result?.balance).toBe(4500.0);
    expect(result?.trxId).toBe("9K48FL29");
    expect(result?.categorySuggestion).toBe("Food & Dining");
  });

  it("parses bKash received money (income) with Fee Tk 0.00", () => {
    const sms = "You have received Tk 500.00 from 01711223344. Fee Tk 0.00. Balance Tk 1,500.00. TrxID 9A7BC12D at 28/10/2026 15:30.";
    const result = parseBangladeshFinancialSms(sms, "bKash");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("bKash");
    expect(result?.type).toBe("income");
    expect(result?.amount).toBe(500.0);
    expect(result?.balance).toBe(1500.0);
    expect(result?.trxId).toBe("9A7BC12D");
  });

  it("parses bKash app push notification for Send Money (expense)", () => {
    const notif = "Send Money of Tk 500.00 to 01712345678 is successful. Fee Tk 5.00. Balance Tk 1,000.00. TrxID 8K21MN45.";
    const result = parseBangladeshFinancialSms(notif, "bKash");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("bKash");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(500.0);
    expect(result?.balance).toBe(1000.0);
    expect(result?.trxId).toBe("8K21MN45");
  });

  it("parses bKash app push notification for Mobile Recharge (expense)", () => {
    const notif = "Mobile Recharge of Tk 50.00 to 01799887766 is successful. Balance Tk 950.00. TrxID 7B33DD99.";
    const result = parseBangladeshFinancialSms(notif, "bKash");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("bKash");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(50.0);
    expect(result?.balance).toBe(950.0);
  });

  it("parses Nagad payment", () => {
    const sms = "Payment Tk 350.00 to Meena Bazar successful. Balance: Tk 1,200.00. TrxID: 71AF90K2.";
    const result = parseBangladeshFinancialSms(sms, "NAGAD");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("Nagad");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(350.0);
    expect(result?.balance).toBe(1200.0);
    expect(result?.categorySuggestion).toBe("Groceries");
  });

  it("parses Rocket received money", () => {
    const sms = "Tk500.00 received from A/C 01812345678. Balance Tk1,950.00. TxnId: 28394019.";
    const result = parseBangladeshFinancialSms(sms, "16216");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("Rocket");
    expect(result?.type).toBe("income");
    expect(result?.amount).toBe(500.0);
    expect(result?.balance).toBe(1950.0);
  });

  it("parses Islami Bank (IBBL / Cellfin) POS debit", () => {
    const sms = "Dear Customer, A/C ...1234 has been debited by BDT 1,500.00 on 28-OCT-26 for POS Txn at UNIMART. Avail Bal BDT 25,400.00.";
    const result = parseBangladeshFinancialSms(sms, "IBBL");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("Islami Bank");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(1500.0);
    expect(result?.balance).toBe(25400.0);
    expect(result?.categorySuggestion).toBe("Groceries");
  });

  it("parses Dutch-Bangla Bank (DBBL / Nexus)", () => {
    const sms = "Your A/C ...5678 is debited with BDT 2,000.00 on 28/10/2026 at ATM-DHAKA. Available Balance is BDT 18,500.00.";
    const result = parseBangladeshFinancialSms(sms, "DBBL");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("DBBL");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(2000.0);
    expect(result?.balance).toBe(18500.0);
  });

  it("parses BRAC Bank card debit with official mask 'BRAC-BANK'", () => {
    const sms = "A/C *1234 has been debited for BDT 3,200.00 on 28-OCT-2026 at AGORA. Available Bal: BDT 45,000.00.";
    const result = parseBangladeshFinancialSms(sms, "BRAC-BANK");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("BRAC Bank");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(3200.0);
    expect(result?.categorySuggestion).toBe("Groceries");
    expect(result?.isVerifiedOfficialSender).toBe(true);
  });

  it("parses City Bank Amex card transaction", () => {
    const sms = "Txn Alert: Card ending 4321 debited for BDT 1,850.00 at PIZZA HUT on 28-OCT-26. Avail Bal: BDT 12,000.00.";
    const result = parseBangladeshFinancialSms(sms, "CITYBANK");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("City Bank");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(1850.0);
    expect(result?.categorySuggestion).toBe("Food & Dining");
  });

  it("parses Eastern Bank (EBL)", () => {
    const sms = "Your A/C ...3210 is debited with BDT 1,200.00 on 28-Oct-26 at SWAPNO. Avail Bal: BDT 8,400.00.";
    const result = parseBangladeshFinancialSms(sms, "EBL");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("Eastern Bank");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(1200.0);
    expect(result?.categorySuggestion).toBe("Groceries");
  });

  it("parses ANY unknown or new bank using universal heuristic", () => {
    // Example: Pubali Bank or Standard Chartered or Community Bank
    const sms = "Dear A/C holder ...9999 debited Tk. 750.00 on 28/10/26 at Pathao. Balance Tk. 15,250.00.";
    const result = parseBangladeshFinancialSms(sms, "PUBALI");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("PUBALI");
    expect(result?.type).toBe("expense");
    expect(result?.amount).toBe(750.0);
    expect(result?.balance).toBe(15250.0);
    expect(result?.categorySuggestion).toBe("Transport");
  });

  it("returns null for non-financial SMS (spam / telecom)", () => {
    const sms = "Dear customer, recharge 29 Tk to get 1GB internet for 3 days. Dial *121*... ";
    // This has no debit/credit/payment context or balance, but let's check
    const result = parseBangladeshFinancialSms(sms, "GP");
    expect(result).toBeNull();
  });

  describe("Anti-Scam & Fraud Protection Shield", () => {
    it("BLOCKS fake bKash money received SMS sent from a personal mobile number (018...)", () => {
      const fakeSms = "You have received Tk 10,000.00 from 01711223344. Ref: Gift. TrxID 9K48FL29. Balance Tk 15,000.00.";
      // Scammer sends from a normal mobile SIM
      const result = parseBangladeshFinancialSms(fakeSms, "01812345678");
      expect(result).toBeNull();
    });

    it("BLOCKS fake bKash money received SMS with country code (+88017...)", () => {
      const fakeSms = "You have received Tk 5,000.00 from 018... TrxID 8A9B0C12. Balance Tk 7,000.00.";
      const result = parseBangladeshFinancialSms(fakeSms, "+8801711223344");
      expect(result).toBeNull();
    });

    it("BLOCKS fake Bank debit SMS sent from personal phone number (019...)", () => {
      const fakeSms = "Your A/C ...1234 has been debited by BDT 20,000.00. Balance BDT 5,000.00.";
      const result = parseBangladeshFinancialSms(fakeSms, "01999887766");
      expect(result).toBeNull();
    });

    it("BLOCKS SMS from unknown, unverified or scam alphanumeric sender IDs", () => {
      const fakeSms = "You won Tk 50,000! Credited to your A/C. Call now.";
      const result = parseBangladeshFinancialSms(fakeSms, "LOTTERY_OFFER");
      expect(result).toBeNull();
    });

    it("ACCEPTS legitimate SMS from official bKash shortcode (16247)", () => {
      const legitSms = "Payment of Tk 150.00 to Pizza Hut successful. TrxID 9K48FL29 at 28/10/2026. Balance Tk 4,500.00.";
      const result = parseBangladeshFinancialSms(legitSms, "16247");
      expect(result).not.toBeNull();
      expect(result?.amount).toBe(150.0);
      expect(result?.isVerifiedOfficialSender).toBe(true);
    });
  });
});
