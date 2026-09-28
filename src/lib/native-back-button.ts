/**
 * native-back-button.ts
 * Gestão do botão 'Back' físico / gestual nativo do Android no GRIOT Mobile.
 * Garante que carregar em Back fecha sheets/diálogos ou regressa ao ecrã anterior,
 * em vez de fechar a aplicação abruptamente.
 */

export function initNativeBackButtonListener(onNavigateHome?: () => void) {
  if (typeof window === "undefined") return;

  const handleBackAction = () => {
    // 1. Fechar modais, sheets ou gavetas ativas
    const activeDialogs = document.querySelectorAll("[role='dialog'], .sheet-up");
    if (activeDialogs.length > 0) {
      window.dispatchEvent(new CustomEvent("griot:close-modals"));
      // Simula tecla Escape para componentes Radix/Headless
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return;
    }

    // 2. Navegação de volta entre ecrãs
    const pathname = window.location.pathname;
    const isRootScreen = pathname === "/home" || pathname === "/" || pathname === "/login";

    if (!isRootScreen) {
      if (window.history.length > 1) {
        window.history.back();
      } else if (onNavigateHome) {
        onNavigateHome();
      } else {
        window.location.href = "/home";
      }
      return;
    }

    // 3. No ecrã principal (/home), permitir saída segura da app
    try {
      (window as any).Capacitor?.Plugins?.App?.exitApp?.();
    } catch {
      // Ignorado em browsers desktop
    }
  };

  try {
    (window as any).Capacitor?.Plugins?.App?.addListener?.("backButton", handleBackAction);
  } catch (err) {
    console.warn("Aviso ao registar listener backButton:", err);
  }
}
