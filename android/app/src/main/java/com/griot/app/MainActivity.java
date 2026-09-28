package com.griot.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.griot.app.plugin.GriotPlugin;
import com.griot.app.plugin.GriotAdsPlugin;
import com.griot.app.plugin.GriotTerminalPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GriotPlugin.class);
        registerPlugin(GriotAdsPlugin.class);
        registerPlugin(GriotTerminalPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "(function() { " +
                "  if (typeof window.griotHandleBackButton === 'function' && window.griotHandleBackButton()) { return 'handled'; } " +
                "  if (window.history.length > 1 && window.location.pathname !== '/' && window.location.pathname !== '/home') { " +
                "    window.history.back(); return 'navigated'; " +
                "  } " +
                "  return 'exit'; " +
                "})()",
                value -> {
                    if (value == null || "\"exit\"".equals(value) || "null".equals(value)) {
                        MainActivity.super.onBackPressed();
                    }
                }
            );
        } else {
            super.onBackPressed();
        }
    }
}
