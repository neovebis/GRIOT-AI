import { useEffect, useRef, useState } from "react";
import {
  destroyNativeAd,
  hideNativeAd,
  initializeNativeAds,
  showNativeAd,
  supportsNativeAds,
} from "@/lib/native-ads";
import { planShowsAds } from "@/lib/gcu-service";

interface NativeAdSlotProps {
  slotId?: string;
  hidden?: boolean;
  className?: string;
}

export function NativeAdSlot({
  slotId = "chat-stationary-dock",
  hidden = false,
  className,
}: NativeAdSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [isNative, setIsNative] = useState(false);
  const [hasAd, setHasAd] = useState(false);
  const isHiddenRef = useRef(hidden);
  isHiddenRef.current = hidden;

  const lastCoordsRef = useRef<{ x: number; y: number; w: number; h: number; visible: boolean }>({
    x: -1,
    y: -1,
    w: -1,
    h: -1,
    visible: false,
  });

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

        // Oculta imediatamente se for comandado pelo componente pai
        if (isHiddenRef.current) {
          if (lastCoordsRef.current.visible) {
            lastCoordsRef.current.visible = false;
            void hideNativeAd(slotId);
          }
          return;
        }

        const rect = element.getBoundingClientRect();
        const slotHeight = 68;
        const visible = rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

        // Verifica se existe alguma gaveta, modal, diálogo, folha ou preview ativo
        const isOverlayOpen = Boolean(
          document.querySelector(
            '[role="dialog"], [data-state="open"], [aria-modal="true"], .drawer-open, [data-vaul-drawer="true"], [data-griot-preview-active="true"]',
          ),
        );

        if (isOverlayOpen || !visible) {
          if (lastCoordsRef.current.visible) {
            lastCoordsRef.current.visible = false;
            void hideNativeAd(slotId);
          }
          return;
        }

        const x = Math.round(rect.left);
        const y = Math.round(rect.top);
        const w = Math.round(rect.width);
        const prev = lastCoordsRef.current;

        // No dock fixo, evita disparos desnecessários na bridge Capacitor se as coordenadas forem idênticas
        if (prev.visible && prev.x === x && prev.y === y && prev.w === w) {
          return;
        }

        lastCoordsRef.current = { x, y, w, h: slotHeight, visible: true };

        const isLight = document.documentElement.classList.contains("light");
        void showNativeAd({
          slotId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: slotHeight,
          darkMode: !isLight,
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

    // Ouve alterações no DOM para esconder ou mostrar instantaneamente quando abrirem gavetas ou menus
    const mutationObserver = new MutationObserver(() => {
      syncPlacement();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "class", "style", "aria-hidden"],
    });

    window.addEventListener("resize", syncPlacement);
    window.addEventListener("orientationchange", syncPlacement);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", syncPlacement);
      window.removeEventListener("orientationchange", syncPlacement);
      void destroyNativeAd(slotId);
    };
  }, [isNative, slotId]);

  // Se a propriedade hidden alternar, aplica imediatamente sem aguardar frames
  useEffect(() => {
    if (!isNative) return;
    if (hidden) {
      lastCoordsRef.current.visible = false;
      void hideNativeAd(slotId);
    } else {
      const element = slotRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const slotHeight = 68;
      const isLight = document.documentElement.classList.contains("light");
      lastCoordsRef.current = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: slotHeight,
        visible: true,
      };
      void showNativeAd({
        slotId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: slotHeight,
        darkMode: !isLight,
      }).then(({ shown }) => {
        if (shown) setHasAd(true);
      });
    }
  }, [hidden, isNative, slotId]);

  if (!isNative) return null;

  return (
    <div
      ref={slotRef}
      aria-label="Anúncio Patrocinado"
      className={
        hidden
          ? "hidden"
          : hasAd
            ? className ||
              "h-[68px] w-full overflow-hidden rounded-2xl border border-hairline/60 bg-surface/30 backdrop-blur-md shadow-xs transition-opacity duration-200"
            : "h-0 w-full overflow-hidden border-none"
      }
    />
  );
}
