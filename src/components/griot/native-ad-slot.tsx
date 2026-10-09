import { useEffect, useRef, useState } from "react";
import { Sparkles, MoreHorizontal } from "lucide-react";
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
  const [, setHasNativeAd] = useState(false);
  const [shouldShowAds, setShouldShowAds] = useState(false);
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
    const show = planShowsAds();
    setShouldShowAds(show);
    setIsNative(supportsNativeAds() && show);
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

        // Oculta imediatamente se for comandado pelo componente pai ou se hidden
        if (isHiddenRef.current) {
          if (lastCoordsRef.current.visible) {
            lastCoordsRef.current.visible = false;
            void hideNativeAd(slotId);
          }
          return;
        }

        const rect = element.getBoundingClientRect();
        const slotHeight = 78;
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
          if (!disposed && shown) setHasNativeAd(true);
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
      const slotHeight = 78;
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
        if (shown) setHasNativeAd(true);
      });
    }
  }, [hidden, isNative, slotId]);

  if (!shouldShowAds) return null;

  return (
    <div
      ref={slotRef}
      aria-label="Anúncio Patrocinado"
      className={
        hidden
          ? "hidden"
          : className ||
            "mx-1 mb-2 h-[78px] w-[calc(100%-8px)] select-none transition-all duration-200"
      }
    >
      {/* Design de Cartão de Anúncio Estilo ChatGPT (Media horizontal + cabeçalho com pill 'Anúncio' + título e descrição) */}
      <div className="flex h-full w-full items-center gap-2.5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#18181b] p-2 shadow-sm transition-colors hover:border-white/[0.12]">
        {/* Lado esquerdo: miniatura retangular com cantos arredondados */}
        <div className="relative h-[62px] w-[80px] shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-800">
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-950/60 via-zinc-900 to-zinc-800" />
          <div className="relative flex h-full w-full items-center justify-center p-2 text-center">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-cyan-300/90 uppercase">
              Griot AI
            </span>
          </div>
        </div>

        {/* Lado direito: Informações estruturadas */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {/* Cabeçalho com ícone da marca, nome do anunciante, tag 'Anúncio' em pill/badge cinzento e botão de opções */}
          <div className="flex items-center justify-between gap-1 leading-none">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="grid size-3.5 shrink-0 place-items-center rounded-sm bg-cyan-500/20 text-cyan-400">
                <Sparkles className="size-2.5" />
              </div>
              <span className="truncate text-[11px] font-medium text-zinc-300">
                Griot Enterprise
              </span>
              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[8.5px] font-medium text-zinc-400 border border-white/[0.04]">
                Anúncio
              </span>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Opções"
              className="shrink-0 text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>

          {/* Título a negrito em destaque */}
          <h4 className="mt-1 truncate text-[12px] font-bold text-white leading-tight">
            Workflows Inteligentes
          </h4>

          {/* Descrição sucinta truncada em no máximo 2 linhas com reticências */}
          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight text-zinc-400">
            Acelere os seus projetos com inteligência e ferramentas automáticas.
          </p>
        </div>
      </div>
    </div>
  );
}
