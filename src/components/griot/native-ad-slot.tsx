import { useEffect, useRef, useState } from "react";
import {
  destroyNativeAd,
  hideNativeAd,
  initializeNativeAds,
  showNativeAd,
  supportsNativeAds,
} from "@/lib/native-ads";
import { planShowsAds } from "@/lib/gcu-service";

export function NativeAdSlot({ slotId }: { slotId: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [isNative, setIsNative] = useState(false);
  const [hasAd, setHasAd] = useState(false);

  useEffect(() => {
    setIsNative(supportsNativeAds() && planShowsAds());
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const element = slotRef.current;
    if (!element) return;

    let disposed = false;
    let frame = 0;

    const syncPlacement = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (disposed) return;
        const rect = element.getBoundingClientRect();
        const slotHeight = 94;
        const visible = rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

        // Verifica se existe alguma gaveta (sidebar), modal, folha ou menu aberto na interface
        const isOverlayOpen = Boolean(
          document.querySelector(
            '[role="dialog"], [data-state="open"], [aria-modal="true"], .fixed.inset-0.z-50, .drawer-open, [data-vaul-drawer="true"]',
          ),
        );

        if (isOverlayOpen || !visible) {
          void hideNativeAd(slotId);
          return;
        }

        void showNativeAd({
          slotId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: slotHeight,
          darkMode: document.documentElement.classList.contains("dark"),
        }).then(({ shown }) => {
          if (!disposed && shown) setHasAd(true);
        });
      });
    };

    void initializeNativeAds()
      .then(syncPlacement)
      .catch(() => undefined);
    const resizeObserver = new ResizeObserver(syncPlacement);
    resizeObserver.observe(element);

    // Ouve alterações no DOM (abertura e fecho de gavetas e modais) para esconder/mostrar o anúncio de imediato
    const mutationObserver = new MutationObserver(() => {
      syncPlacement();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "class", "style", "aria-hidden"],
    });

    window.addEventListener("scroll", syncPlacement, true);
    window.addEventListener("resize", syncPlacement);
    const loadCheck = window.setInterval(syncPlacement, 800);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.clearInterval(loadCheck);
      window.removeEventListener("scroll", syncPlacement, true);
      window.removeEventListener("resize", syncPlacement);
      void destroyNativeAd(slotId);
    };
  }, [isNative, slotId]);

  if (!isNative) return null;

  return (
    <div
      ref={slotRef}
      aria-label="Anúncio"
      className={
        hasAd
          ? "mt-3 h-[94px] w-full overflow-hidden rounded-2xl border border-hairline/80 bg-surface"
          : "h-0 w-full overflow-hidden"
      }
    />
  );
}
