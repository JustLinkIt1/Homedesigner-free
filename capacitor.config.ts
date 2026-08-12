import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homedesigner.app',
  appName: 'HomeDesigner',
  webDir: 'dist',
  server: {
    // Keep the default https scheme: a stable origin so localStorage / saved
    // projects persist, and SPA asset loading works inside the WebView.
    androidScheme: 'https',
  },
  android: {
    // Diagnostic build switches, OFF unless HD_DEBUG_BUILD=1 at `cap sync` time.
    //
    // A debug-signed APK is not an option for diagnosing store problems: it
    // cannot match Play's app-signing key, so it will not install over the Play
    // build and Play Billing fails for reasons that have nothing to do with the
    // bug under investigation. These two flags get the same visibility on a
    // REAL, Play-installed release build instead.
    //
    // `loggingBehavior: 'production'` is the one that matters most. Capacitor
    // defaults to 'debug', which forwards console.* to logcat ONLY in debug
    // builds — which is exactly why the `[pro]` breadcrumbs added in 1.22.10
    // produced zero Capacitor/Console lines across two full logcat captures.
    // With this set, they reach logcat on a release build.
    //
    // `webContentsDebuggingEnabled` lets chrome://inspect attach DevTools to the
    // release WebView, so the offerings object can be read directly.
    //
    // Both are env-gated because shipping them to PRODUCTION means every user's
    // WebView is inspectable by anything with adb access. Fine for an internal
    // testing build; not something to leave on by default. A plain
    // `npm run android:aab` has them off.
    loggingBehavior: process.env.HD_DEBUG_BUILD === '1' ? 'production' : 'debug',
    webContentsDebuggingEnabled: process.env.HD_DEBUG_BUILD === '1',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // Matches the app's light UI + web theme-color so launch doesn't flash dark.
      backgroundColor: '#f6f5f2',
      showSpinner: false,
    },
    SocialLogin: {
      // Keep the native dependency surface small: this release only uses
      // Google's Android Credential Manager integration.
      providers: {
        google: true,
        apple: false,
        facebook: false,
        twitter: false,
      },
    },
  },
};

export default config;
