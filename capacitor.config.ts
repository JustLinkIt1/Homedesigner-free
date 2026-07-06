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
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // Matches the app's light UI + web theme-color so launch doesn't flash dark.
      backgroundColor: '#f6f5f2',
      showSpinner: false,
    },
  },
};

export default config;
