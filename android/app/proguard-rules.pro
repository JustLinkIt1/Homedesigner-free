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
