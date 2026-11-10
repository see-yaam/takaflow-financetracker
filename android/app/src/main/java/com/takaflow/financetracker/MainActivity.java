package com.takaflow.financetracker;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_RECORD_AUDIO = 2002;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        // Prompt user for RECORD_AUDIO permission at runtime
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS},
                PERMISSION_REQUEST_RECORD_AUDIO
            );
        }

        // Disable scrollbars on Android WebView for a 100% native look
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setVerticalScrollBarEnabled(false);
            this.bridge.getWebView().setHorizontalScrollBarEnabled(false);
            this.bridge.getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        }
    }
}
