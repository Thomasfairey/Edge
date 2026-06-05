import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.theedge.app",
  appName: "The Edge",
  // Live URL mode: point at your Vercel deployment.
  // NOTE: the bare "the-edge.vercel.app" alias does NOT exist on this project
  // (returns 404); the canonical public production domain is
  // "the-edge-xi.vercel.app". If you add a stable custom domain later, update
  // this and rebuild the native app (a Vercel deploy alone won't change it).
  server: {
    url: "https://the-edge-xi.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "theedge",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#FAF9F6",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#5A52E0",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
