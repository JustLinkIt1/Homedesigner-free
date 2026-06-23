import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nathanjoppich.homedesigner',
  appName: 'Home Designer',
  webDir: 'dist',
  server: {
    // Keep the default https scheme: a stable origin so localStorage / saved
    // projects persist, and SPA asset loading works inside the WebView.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0f1115',
      showSpinner: false,
    },
  },
};

export default config;
