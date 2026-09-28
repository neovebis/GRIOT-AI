import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeAdPlacement = {
  slotId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  darkMode: boolean;
};

type NativeAdsPlugin = {
  initializeAds(): Promise<{ ready: boolean; privacyOptionsRequired: boolean }>;
  showNativeAd(options: NativeAdPlacement): Promise<{ shown: boolean }>;
  hideNativeAd(options: { slotId: string }): Promise<void>;
  destroyNativeAd(options: { slotId: string }): Promise<void>;
  showAdPrivacyOptions(): Promise<void>;
};

const NativeAds = registerPlugin<NativeAdsPlugin>("GriotAdsPlugin");

export function supportsNativeAds(): boolean {
  return typeof window !== "undefined" && Capacitor.getPlatform() === "android";
}

export async function initializeNativeAds() {
  if (!supportsNativeAds()) return { ready: false, privacyOptionsRequired: false };
  return NativeAds.initializeAds();
}

export async function showNativeAd(options: NativeAdPlacement) {
  if (!supportsNativeAds()) return { shown: false };
  return NativeAds.showNativeAd(options);
}

export async function hideNativeAd(slotId: string) {
  if (!supportsNativeAds()) return;
  await NativeAds.hideNativeAd({ slotId });
}

export async function destroyNativeAd(slotId: string) {
  if (!supportsNativeAds()) return;
  await NativeAds.destroyNativeAd({ slotId });
}

export async function showAdPrivacyOptions() {
  if (!supportsNativeAds()) return;
  await NativeAds.showAdPrivacyOptions();
}
