package com.homedesigner.app;

import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Deliberately small Google Play Billing bridge. HomeDesigner sells a lifetime
 * one-time product, but Play promotions can grant a monthly/yearly subscription
 * outside the app. Ownership therefore has to read both product types even
 * though checkout itself remains the one-time product.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "HomeDesignerBilling";

    private BillingClient billingClient;
    private boolean connecting = false;
    private final List<ConnectionWaiter> connectionWaiters = new ArrayList<>();
    private PluginCall pendingPurchaseCall;
    private String pendingProductId;
    private long purchaseGeneration = 0;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    private interface FailureCallback {
        void fail(BillingResult result);
    }

    private static class ConnectionWaiter {
        final Runnable ready;
        final FailureCallback failed;

        ConnectionWaiter(Runnable ready, FailureCallback failed) {
            this.ready = ready;
            this.failed = failed;
        }
    }

    private synchronized void withReady(Runnable ready, FailureCallback failed) {
        if (billingClient != null && billingClient.isReady()) {
            ready.run();
            return;
        }
        connectionWaiters.add(new ConnectionWaiter(ready, failed));
        if (connecting) return;
        connecting = true;
        Log.i(TAG, "Connecting to Google Play Billing");
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                List<ConnectionWaiter> waiters;
                synchronized (PlayBillingPlugin.this) {
                    connecting = false;
                    waiters = new ArrayList<>(connectionWaiters);
                    connectionWaiters.clear();
                }
                Log.i(TAG, "Billing setup: " + describe(result));
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    for (ConnectionWaiter waiter : waiters) waiter.ready.run();
                } else {
                    for (ConnectionWaiter waiter : waiters) waiter.failed.fail(result);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                List<ConnectionWaiter> waiters;
                synchronized (PlayBillingPlugin.this) {
                    connecting = false;
                    waiters = new ArrayList<>(connectionWaiters);
                    connectionWaiters.clear();
                }
                Log.w(TAG, "Billing service disconnected; the next call will reconnect");
                BillingResult disconnected = BillingResult.newBuilder()
                    .setResponseCode(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED)
                    .setDebugMessage("Google Play Billing disconnected")
                    .build();
                for (ConnectionWaiter waiter : waiters) waiter.failed.fail(disconnected);
            }
        });
    }

    private static String describe(BillingResult result) {
        return result.getResponseCode() + " " + result.getDebugMessage();
    }

    private static void reject(PluginCall call, String operation, BillingResult result) {
        call.reject(operation + " failed (Play " + describe(result) + ")",
            Integer.toString(result.getResponseCode()));
    }

    @PluginMethod
    public void connect(PluginCall call) {
        withReady(() -> call.resolve(new JSObject().put("ready", true)),
            result -> reject(call, "Store connection", result));
    }

    private void queryProduct(String productId, ProductCallback callback, FailureCallback failed) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.INAPP)
            .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(product))
            .build();
        billingClient.queryProductDetailsAsync(params, (result, detailsResult) -> {
            Log.i(TAG, "Product query " + productId + ": " + describe(result));
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                failed.fail(result);
                return;
            }
            List<ProductDetails> products = detailsResult.getProductDetailsList();
            if (products == null || products.isEmpty()) {
                callback.complete(null);
                return;
            }
            callback.complete(products.get(0));
        });
    }

    private interface ProductCallback {
        void complete(ProductDetails details);
    }

    /** Only call after the authenticated server has credited this receipt. */
    @PluginMethod
    public void consumePoints(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null || token.isBlank()) { call.reject("purchaseToken is required"); return; }
        withReady(() -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP).build();
            billingClient.queryPurchasesAsync(params, (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    reject(call, "Owned purchase query", result); return;
                }
                Purchase found = null;
                if (purchases != null) {
                    for (Purchase item : purchases) if (item.getPurchaseToken().equals(token)) found = item;
                }
                if (found == null) { call.resolve(new JSObject().put("consumed", true)); return; }
                boolean points = false;
                for (String id : found.getProducts()) {
                    if (id.matches("points_(2000|6000|15000)(_pro)?")) points = true;
                }
                if (!points || found.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
                    call.reject("Only completed point packs can be consumed"); return;
                }
                billingClient.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (consumed, receipt) -> {
                    if (consumed.getResponseCode() == BillingClient.BillingResponseCode.OK
                        || consumed.getResponseCode() == BillingClient.BillingResponseCode.ITEM_NOT_OWNED) {
                        call.resolve(new JSObject().put("consumed", true));
                    } else reject(call, "Point pack consumption", consumed);
                });
            });
        }, result -> reject(call, "Store connection", result));
    }

    private interface PurchasesCallback {
        void complete(BillingResult result, List<Purchase> purchases);
    }

    /** Query both Play ownership namespaces. A promo-code subscription is not
     * returned by an INAPP query, and a lifetime unlock is not returned by a
     * SUBS query. If either namespace succeeds, return its trustworthy result;
     * only fail when Play rejected both queries. */
    private void queryAllPurchases(PurchasesCallback callback) {
        QueryPurchasesParams inAppParams = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build();
        billingClient.queryPurchasesAsync(inAppParams, (inAppResult, inAppPurchases) -> {
            List<Purchase> combined = new ArrayList<>();
            if (inAppResult.getResponseCode() == BillingClient.BillingResponseCode.OK && inAppPurchases != null) {
                combined.addAll(inAppPurchases);
            }
            QueryPurchasesParams subscriptionParams = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
            billingClient.queryPurchasesAsync(subscriptionParams, (subscriptionResult, subscriptionPurchases) -> {
                if (subscriptionResult.getResponseCode() == BillingClient.BillingResponseCode.OK
                    && subscriptionPurchases != null) {
                    combined.addAll(subscriptionPurchases);
                }
                if (inAppResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    callback.complete(inAppResult, combined);
                } else if (subscriptionResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    callback.complete(subscriptionResult, combined);
                } else {
                    callback.complete(inAppResult, Collections.emptyList());
                }
            });
        });
    }

    private static ProductDetails.OneTimePurchaseOfferDetails chooseOffer(ProductDetails details) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers =
            details.getOneTimePurchaseOfferDetailsList();
        return offers == null || offers.isEmpty() ? null : offers.get(0);
    }

    private static JSObject productJson(ProductDetails details) {
        JSObject result = new JSObject();
        result.put("identifier", details.getProductId());
        result.put("title", details.getTitle());
        result.put("description", details.getDescription());
        ProductDetails.OneTimePurchaseOfferDetails offer = chooseOffer(details);
        if (offer != null) {
            result.put("priceString", offer.getFormattedPrice());
            result.put("priceAmountMicros", offer.getPriceAmountMicros());
            result.put("currencyCode", offer.getPriceCurrencyCode());
            result.put("offerToken", offer.getOfferToken());
        }
        return result;
    }

    @PluginMethod
    public void getProduct(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isBlank()) {
            call.reject("productId is required");
            return;
        }
        withReady(() -> queryProduct(productId, details -> {
            JSObject result = new JSObject();
            result.put("product", details == null ? null : productJson(details));
            call.resolve(result);
        }, result -> reject(call, "Product query", result)),
            result -> reject(call, "Store connection", result));
    }

    private synchronized boolean isCurrentPurchase(PluginCall call, long generation) {
        return pendingPurchaseCall == call && purchaseGeneration == generation;
    }

    private synchronized boolean clearCurrentPurchase(PluginCall call, long generation) {
        if (!isCurrentPurchase(call, generation)) return false;
        pendingPurchaseCall = null;
        pendingProductId = null;
        return true;
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isBlank()) {
            call.reject("productId is required");
            return;
        }
        final long generation;
        synchronized (this) {
            if (pendingPurchaseCall != null) {
                call.reject("Another purchase is already in progress", "PURCHASE_IN_PROGRESS");
                return;
            }
            pendingPurchaseCall = call;
            pendingProductId = productId;
            generation = ++purchaseGeneration;
        }

        withReady(() -> queryProduct(productId, details -> {
            if (!isCurrentPurchase(call, generation)) return;
            if (details == null) {
                if (clearCurrentPurchase(call, generation)) {
                    call.reject("Google Play did not return " + productId + " for this account and country.",
                        "PRODUCT_NOT_FOUND");
                }
                return;
            }
            ProductDetails.OneTimePurchaseOfferDetails offer = chooseOffer(details);
            if (offer == null) {
                if (clearCurrentPurchase(call, generation)) {
                    call.reject("Google Play returned the product without a purchasable offer.",
                        "OFFER_NOT_FOUND");
                }
                return;
            }
            BillingFlowParams.ProductDetailsParams productParams =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.getOfferToken())
                    .build();
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams))
                .build();

            getActivity().runOnUiThread(() -> {
                if (!isCurrentPurchase(call, generation)) return;
                BillingResult launch = billingClient.launchBillingFlow(getActivity(), flow);
                Log.i(TAG, "launchBillingFlow " + productId + ": " + describe(launch));
                if (launch.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                    if (clearCurrentPurchase(call, generation)) queryOwnedForCall(call, productId);
                } else if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    if (clearCurrentPurchase(call, generation)) reject(call, "Purchase launch", launch);
                }
            });
        }, result -> {
            if (clearCurrentPurchase(call, generation)) reject(call, "Product query", result);
        }), result -> {
            if (clearCurrentPurchase(call, generation)) reject(call, "Store connection", result);
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        PluginCall call;
        String requestedProduct;
        synchronized (this) {
            call = pendingPurchaseCall;
            requestedProduct = pendingProductId;
            pendingPurchaseCall = null;
            pendingProductId = null;
            purchaseGeneration += 1;
        }
        Log.i(TAG, "Purchase update: " + describe(result) + ", count=" +
            (purchases == null ? 0 : purchases.size()));
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Purchase cancelled.", "USER_CANCELED");
            return;
        }
        if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            queryOwnedForCall(call, requestedProduct);
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            reject(call, "Purchase", result);
            return;
        }
        Purchase purchase = findPurchase(purchases, requestedProduct);
        if (purchase == null) {
            call.reject("Google Play completed without returning the purchase.", "PURCHASE_MISSING");
            return;
        }
        call.resolve(new JSObject().put("purchase", purchaseJson(purchase)));
    }

    private static Purchase findPurchase(List<Purchase> purchases, String productId) {
        if (purchases == null) return null;
        for (Purchase purchase : purchases) {
            if (productId == null || purchase.getProducts().contains(productId)) return purchase;
        }
        return null;
    }

    private static JSObject purchaseJson(Purchase purchase) {
        JSObject result = new JSObject();
        JSArray products = new JSArray();
        for (String product : purchase.getProducts()) products.put(product);
        result.put("products", products);
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("purchaseState", purchase.getPurchaseState());
        result.put("acknowledged", purchase.isAcknowledged());
        result.put("purchaseTime", purchase.getPurchaseTime());
        result.put("orderId", purchase.getOrderId());
        return result;
    }

    private void queryOwnedForCall(PluginCall call, String productId) {
        queryAllPurchases((result, purchases) -> {
            Log.i(TAG, "Owned purchase query: " + describe(result));
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                reject(call, "Owned purchase query", result);
                return;
            }
            Purchase purchase = findPurchase(purchases, productId);
            JSObject response = new JSObject();
            response.put("purchase", purchase == null ? null : purchaseJson(purchase));
            call.resolve(response);
        });
    }

    @PluginMethod
    public void getPurchases(PluginCall call) {
        withReady(() -> {
            queryAllPurchases((result, purchases) -> {
                Log.i(TAG, "Owned purchases: " + describe(result));
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    reject(call, "Owned purchase query", result);
                    return;
                }
                JSArray items = new JSArray();
                for (Purchase purchase : purchases) items.put(purchaseJson(purchase));
                call.resolve(new JSObject().put("purchases", items));
            });
        }, result -> reject(call, "Store connection", result));
    }

    @PluginMethod
    public synchronized void resetPurchaseFlow(PluginCall call) {
        purchaseGeneration += 1;
        if (pendingPurchaseCall != null) {
            pendingPurchaseCall.reject("Purchase result timed out; ownership will be checked directly.",
                "PURCHASE_TIMEOUT");
            pendingPurchaseCall = null;
            pendingProductId = null;
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) billingClient.endConnection();
        billingClient = null;
        super.handleOnDestroy();
    }
}
