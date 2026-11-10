package com.takaflow.financetracker;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** JVM unit tests for the native anti-scam shield (run in CI: :app:testDebugUnitTest). */
public class SenderShieldTest {

    private static final String SCAM_BODY = "You have received Tk 5,000.00 from bKash. TrxID 9K48FL29XY. Balance Tk 7,500.00";

    @Test
    public void rejectsPersonalNumbersEvenWhenTheTextMentionsBkash() {
        assertTrue(SenderShield.isPersonalNumber("01712345678"));
        assertTrue(SenderShield.isPersonalNumber("+8801812345678"));
        assertTrue(SenderShield.isPersonalNumber("8801912345678"));
        assertTrue(SenderShield.isPersonalNumber("+880 171-234-5678"));
        assertFalse(SenderShield.acceptSms("01712345678", SCAM_BODY));
        assertFalse(SenderShield.acceptSms("+8801812345678", SCAM_BODY));
    }

    @Test
    public void rejectsUnknownSendersAndContactLikeTitles() {
        assertFalse(SenderShield.acceptSms("", SCAM_BODY));
        assertFalse(SenderShield.acceptSms(null, SCAM_BODY));
        assertFalse(SenderShield.acceptSms("Unknown", SCAM_BODY));
        assertFalse(SenderShield.acceptSms("Rahim Bhai", SCAM_BODY));
        assertFalse(SenderShield.acceptSms("Messages", SCAM_BODY));
        assertFalse(SenderShield.acceptSms("+447700900123", SCAM_BODY));
    }

    @Test
    public void acceptsOfficialMasksAndShortCodes() {
        assertTrue(SenderShield.acceptSms("bKash", SCAM_BODY));
        assertTrue(SenderShield.acceptSms("NAGAD", "Cash In Tk 500.00 successful. Balance Tk 1,200.00"));
        assertTrue(SenderShield.acceptSms("16216", "Tk 300 sent. Balance Tk 900"));
        assertTrue(SenderShield.acceptSms("BRAC-BANK", "Your A/C debited BDT 1,000.00"));
        assertTrue(SenderShield.acceptSms("DBBL", "Tk 2,000 credited to your account"));
    }

    @Test
    public void requiresFinancialContentFromOfficialSenders() {
        assertFalse(SenderShield.acceptSms("bKash", "Get 50% off on your next purchase!"));
        assertTrue(SenderShield.hasFinancialKeyword("আপনার অ্যাকাউন্টে ৫০০ টাকা জমা হয়েছে"));
    }
}
