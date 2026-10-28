import { describe, it, expect } from "vitest";
import { parseVoiceInput, convertBnDigitsToEn } from "@/lib/voiceParser";

describe("Voice Transaction NLP Parser", () => {
  it("converts Bengali digits to English digits", () => {
    expect(convertBnDigitsToEn("৪০০ টাকা")).toBe("400 টাকা");
    expect(convertBnDigitsToEn("১২৫০")).toBe("1250");
  });

  it("parses: '৪০০ টাকা খরচ করে আসলাম রেস্টুরেন্টে' (Bangla)", () => {
    const res = parseVoiceInput("৪০০ টাকা খরচ করে আসলাম রেস্টুরেন্টে");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(400);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Food & Dining");
  });

  it("parses: '500 taka sesh ghurte giye' (Banglish)", () => {
    const res = parseVoiceInput("500 taka sesh ghurte giye");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(500);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Entertainment");
  });

  it("parses: 'রিকশা ভাড়া দিলাম ৬০ টাকা' (Transport)", () => {
    const res = parseVoiceInput("রিকশা ভাড়া দিলাম ৬০ টাকা");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(60);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Transport");
  });

  it("parses: 'টিউশনি থেকে ৩০০০ টাকা পেলাম' (Income)", () => {
    const res = parseVoiceInput("টিউশনি থেকে ৩০০০ টাকা পেলাম");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(3000);
    expect(res?.type).toBe("income");
    expect(res?.category).toBe("Tuition");
  });

  it("parses: 'বিকাশে ৫০০০ টাকা ঢুকছে বেতন' (Income Salary)", () => {
    const res = parseVoiceInput("বিকাশে ৫০০০ টাকা ঢুকছে বেতন");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(5000);
    expect(res?.type).toBe("income");
    expect(res?.category).toBe("Salary");
  });

  it("parses: 'দারাজ থেকে ১৫০০ টাকার শপিং করলাম' (Shopping)", () => {
    const res = parseVoiceInput("দারাজ থেকে ১৫০০ টাকার শপিং করলাম");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(1500);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Shopping");
  });

  it("parses 'k' notation: '2k taka spent on grocery'", () => {
    const res = parseVoiceInput("2k taka spent on grocery");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(2000);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Groceries");
  });
});
