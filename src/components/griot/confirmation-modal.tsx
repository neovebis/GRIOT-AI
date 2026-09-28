import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  icon?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "destructive",
  icon,
  onConfirm,
  onClose,
}: ConfirmationModalProps) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[24px] border border-hairline bg-surface p-5 shadow-2xl space-y-4 rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${
              variant === "destructive"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-primary/10 text-primary border-primary/20"
            }`}
          >
            {icon || <AlertTriangle className="size-5" />}
          </div>
          <div className="min-w-0 flex-1 pr-1">
            <h3 className="text-[16px] font-semibold text-foreground leading-tight">{title}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Fechar")}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 pt-2 border-t border-hairline/60">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-hairline py-2.5 text-[13.5px] font-medium text-foreground hover:bg-secondary/60 active:scale-95 transition-all text-center"
          >
            {cancelLabel || t("Cancelar")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 rounded-full py-2.5 text-[13.5px] font-semibold shadow-xs active:scale-95 transition-all text-center ${
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:opacity-90"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {confirmLabel || t("Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
