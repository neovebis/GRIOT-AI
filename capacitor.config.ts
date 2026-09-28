import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuração nativa (Capacitor) para Android / iOS.
 */
const config: CapacitorConfig = {
  appId: "com.griot.app",
  appName: "GRIOT",
  webDir: ".output/public",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#060608",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

export default config;
