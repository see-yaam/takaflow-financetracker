import { describe, it, expect } from "vitest";
import { parseVoiceInput, convertBnDigitsToEn, guessCategoryEmoji } from "@/lib/voiceParser";

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

  it("detects wallet from voice: 'bKash theke 400 taka resturant e khoroch'", () => {
    const res = parseVoiceInput("bKash theke 400 taka resturant e khoroch");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(400);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Food & Dining");
    expect(res?.detectedWallet).toBe("bKash");
  });

  it("detects Cash wallet: 'cash theke 200 taka rickshaw bhara dilam'", () => {
    const res = parseVoiceInput("cash theke 200 taka rickshaw bhara dilam");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(200);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Transport");
    expect(res?.detectedWallet).toBe("Cash");
  });

  it("detects Nagad wallet in income: 'নগদে ১০০০ টাকা আসলো'", () => {
    const res = parseVoiceInput("নগদে ১০০০ টাকা আসলো");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(1000);
    expect(res?.type).toBe("income");
    expect(res?.detectedWallet).toBe("Nagad");
  });

  it("detects Bank wallet: 'City Bank theke 5000 taka shopping'", () => {
    const res = parseVoiceInput("City Bank theke 5000 taka shopping");
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(5000);
    expect(res?.type).toBe("expense");
    expect(res?.category).toBe("Shopping");
    expect(res?.detectedWallet).toBe("Bank");
  });

  describe("Dynamic Category Extraction & Custom Category Matching", () => {
    it("matches user custom category when passed", () => {
      const res = parseVoiceInput("Netflix e 500 taka dilam", ["Netflix", "Spotify"]);
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(500);
      expect(res?.category).toBe("Netflix");
    });

    it("extracts dynamic subject instead of falling back to Other for Gym", () => {
      const res = parseVoiceInput("Gym e 1500 taka dilam");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(1500);
      expect(res?.category).not.toBe("Other");
      expect(["Fitness & Gym", "Gym"]).toContain(res?.category);
    });

    it("always returns category in English even when spoken in Bengali: 'লন্ড্রিতে ২৫০ টাকা দিলাম'", () => {
      const res = parseVoiceInput("লন্ড্রিতে ২৫০ টাকা দিলাম");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(250);
      expect(res?.category).not.toBe("Other");
      expect(res?.category).toBe("Laundry");
      // Assert no Bengali characters in category
      expect(/[\u0980-\u09FF]/.test(res?.category || "")).toBe(false);
    });

    it("maps other Bengali spoken entities to English", () => {
      const doctorRes = parseVoiceInput("ডাক্তার কে ১০০০ টাকা দিলাম");
      expect(doctorRes?.category).toBe("Healthcare");

      const tailorRes = parseVoiceInput("দর্জি কে ৫০০ টাকা দিলাম");
      expect(tailorRes?.category).toBe("Tailor");

      const gymRes = parseVoiceInput("জিম এ ১৫০০ টাকা দিলাম");
      expect(gymRes?.category).toBe("Fitness & Gym");
    });

    it("parses: '500 takar bazar' and phonetic 'Pachu takar bajar.'", () => {
      const res1 = parseVoiceInput("500 takar bazar");
      expect(res1).not.toBeNull();
      expect(res1?.amount).toBe(500);
      expect(res1?.category).toBe("Groceries");
      expect(res1?.type).toBe("expense");

      const res2 = parseVoiceInput("Pachu takar bajar.");
      expect(res2).not.toBeNull();
      expect(res2?.amount).toBe(500);
      expect(res2?.category).toBe("Groceries");
      expect(res2?.type).toBe("expense");

      const res3 = parseVoiceInput("৫০০ টাকার বাজার");
      expect(res3).not.toBeNull();
      expect(res3?.amount).toBe(500);
      expect(res3?.category).toBe("Groceries");
      expect(res3?.type).toBe("expense");
    });

    it("parses: 'টিচার ফি ওয়ান, ৳1000।' as Education (never Food & Dining)", () => {
      const res = parseVoiceInput("টিচার ফি ওয়ান, ৳1000।");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(1000);
      expect(res?.type).toBe("expense");
      expect(res?.category).toBe("Education");
    });

    it("parses: 'লস্ট মাই ওয়ান থাউজ্যান্ড, টাকা।' as 1000 expense", () => {
      const res = parseVoiceInput("লস্ট মাই ওয়ান থাউজ্যান্ড, টাকা।");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(1000);
      expect(res?.type).toBe("expense");
    });

    it("parses exact user speech: 'টিচার ফি ওয়ান থাউজ্যান্ড টাকা ফ্রম ব্যাংক।'", () => {
      const res = parseVoiceInput("টিচার ফি ওয়ান থাউজ্যান্ড টাকা ফ্রম ব্যাংক।");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(1000);
      expect(res?.type).toBe("expense");
      expect(res?.category).toBe("Education");
      expect(res?.detectedWallet).toBe("Bank");
    });

    it("parses user spoken input: 'পকেট থেকে ৳100 হারায় গেছে।' as Cash wallet and Lost Money category", () => {
      const res = parseVoiceInput("পকেট থেকে ৳100 হারায় গেছে।");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(100);
      expect(res?.type).toBe("expense");
      expect(res?.category).toBe("Lost Money");
      expect(res?.detectedWallet).toBe("Cash");
      expect(res?.note).toBe("হারায় গেছে।");
    });

    it("parses Banglish: 'pocket theke 500 taka haraye geche' as Cash and Lost Money", () => {
      const res = parseVoiceInput("pocket theke 500 taka haraye geche");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(500);
      expect(res?.type).toBe("expense");
      expect(res?.category).toBe("Lost Money");
      expect(res?.detectedWallet).toBe("Cash");
    });

    it("parses: 'মানিব্যাগ থেকে ২০০ টাকা চুরি গেছে' as Cash and Lost Money", () => {
      const res = parseVoiceInput("মানিব্যাগ থেকে ২০০ টাকা চুরি গেছে");
      expect(res).not.toBeNull();
      expect(res?.amount).toBe(200);
      expect(res?.type).toBe("expense");
      expect(res?.category).toBe("Lost Money");
      expect(res?.detectedWallet).toBe("Cash");
    });

    it("guesses appropriate emojis for auto-built categories", () => {
      expect(guessCategoryEmoji("Gym")).toBe("🏋️");
      expect(guessCategoryEmoji("Dentist")).toBe("🩺");
      expect(guessCategoryEmoji("Laundry")).toBe("🧺");
      expect(guessCategoryEmoji("Cinema")).toBe("🎬");
      expect(guessCategoryEmoji("Cat Food")).toBe("🐾");
      expect(guessCategoryEmoji("Lost Money")).toBe("💸");
    });
  });
});

