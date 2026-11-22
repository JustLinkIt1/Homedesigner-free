package com.homedesigner.app;

import android.content.Context;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Reads the Google Play install referrer once so the app can tell which campaign
 * an install came from. Returns only the raw referrer string
 * (e.g. "utm_source=google-play&utm_campaign=spring"); the web layer picks the
 * two values it wants. Every failure resolves with an empty referrer: this must
 * never crash the app or leave the call pending.
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {
    @PluginMethod
    public void getReferrer(final PluginCall call) {
        final AtomicBoolean done = new AtomicBoolean(false);
        try {
            final Context context = getContext();
            final InstallReferrerClient client = InstallReferrerClient.newBuilder(context).build();
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int responseCode) {
                    String referrer = "";
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            String raw = client.getInstallReferrer().getInstallReferrer();
                            if (raw != null) referrer = raw;
                        }
                    } catch (Throwable ignored) {
                        referrer = "";
                    }
                    try { client.endConnection(); } catch (Throwable ignored) { /* ignore */ }
                    finish(call, done, referrer);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    finish(call, done, "");
                }
            });
        } catch (Throwable t) {
            finish(call, done, "");
        }
    }

    private static void finish(PluginCall call, AtomicBoolean done, String referrer) {
        if (!done.compareAndSet(false, true)) return;
        try {
            JSObject result = new JSObject();
            result.put("referrer", referrer == null ? "" : referrer);
            call.resolve(result);
        } catch (Throwable ignored) {
            /* ignore */
        }
    }
}
