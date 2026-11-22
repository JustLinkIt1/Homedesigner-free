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
 * two values it wants. Every failure resolves with ok=false: this must
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
                    String referrer = null;
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            referrer = "";
                            String raw = client.getInstallReferrer().getInstallReferrer();
                            if (raw != null) referrer = raw;
                        }
                    } catch (Throwable ignored) {
                        referrer = null;
                    }
                    try { client.endConnection(); } catch (Throwable ignored) { /* ignore */ }
                    finish(call, done, referrer);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    finish(call, done, null);
                }
            });
        } catch (Throwable t) {
            finish(call, done, null);
        }
    }

    private static void finish(PluginCall call, AtomicBoolean done, String referrer) {
        if (!done.compareAndSet(false, true)) return;
        try {
            JSObject result = new JSObject();
            // ok=false: Play could not say (no service, not supported, error). Not the
            // same as an organic install, which is ok=true with no campaign.
            result.put("ok", referrer != null);
            result.put("referrer", referrer == null ? "" : referrer);
            call.resolve(result);
        } catch (Throwable ignored) {
            /* ignore */
        }
    }
}
