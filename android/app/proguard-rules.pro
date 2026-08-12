# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# Capacitor
#
# Plugin classes are resolved BY NAME at runtime from capacitor.plugins.json,
# so nothing in the compiled code references them and R8 would strip them as
# unused. Everything below exists because a static analyser cannot see through
# reflection, not as blanket insurance.
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public *; }

# Methods the WebView calls across the JS bridge.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Cordova plugins bridged through capacitor-cordova-android-plugins.
-keep class org.apache.cordova.** { *; }

# NOTE: no keeps for RevenueCat, social-login or app-update. Those ship consumer
# ProGuard rules that R8 applies automatically; adding our own would mask a real
# gap and partly defeat the optimisation. Add a rule only in response to an
# actual failure, and say which one.
#
# Verified still true for RevenueCat: R8's merged configuration.txt contains
# `-keep class com.revenuecat.** { *; }` from the SDK's own consumer rules, and
# usage.txt removes none of its classes.

# ---------------------------------------------------------------------------
# kotlinx.coroutines
#
# The failure: no Play sheet, no products, no error, no timeout — the store
# simply never answered, on a build where every server-side check was correct.
#
# RevenueCat's SDK is Kotlin and delivers its callbacks through
# Dispatchers.Main. Coroutines resolves that at runtime by reading the resource
# META-INF/services/kotlinx.coroutines.internal.MainDispatcherFactory — looked
# up as a LITERAL string, so R8's ServiceLoader rewriting does not save it. In
# the 1.22.14 bundle R8 had renamed that file to META-INF/services/q4.h0, and a
# lookup that misses leaves MissingMainCoroutineDispatcher in place: every
# main-thread dispatch then throws and each SDK callback dies where nothing
# reports it.
#
# Unlike RevenueCat's, the coroutines consumer rules are NOT in R8's merged
# configuration.txt — grepping it for MainDispatcherFactory returns nothing —
# so nothing was keeping these names. R8 was switched on in 1.21.0 (8d2fda7)
# and no purchase has completed since.
#
# The coroutines library ships DIFFERENT rules for R8 vs ProGuard. Its
# r8-from-1.6.0/coroutines.pro deliberately omits all ServiceLoader keeps and
# uses -assumenosideeffects to disable the fast ServiceLoader path, trusting
# R8's native ServiceLoader optimization to directly instantiate the
# implementations. That optimization demonstrably failed here: in 1.22.14 the
# META-INF/services file was RENAMED (to q4.h0), not inlined — R8 never
# replaced the ServiceLoader call. The interface name rule (1.22.15) fixed the
# file lookup, but without keeping the IMPLEMENTATION classes R8 is free to
# rename or remove AndroidDispatcherFactory, breaking instantiation even when
# the file is found.
#
# These rules mirror what the library itself ships in its ProGuard variant
# (META-INF/proguard/coroutines.pro and r8-upto-3.0.0/coroutines.pro) but
# omits from the R8 >= 3.0.0 variant.
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keep class kotlinx.coroutines.android.AndroidDispatcherFactory { *; }
-keep class kotlinx.coroutines.android.AndroidExceptionPreHandler { *; }
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
