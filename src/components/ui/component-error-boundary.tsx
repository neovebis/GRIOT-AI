import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary granular para componentes React.
 * Impede que a quebra de um elemento isolado (gráfico, markdown, tabela)
 * faça cair a página ou aplicação inteira.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ComponentErrorBoundary] Erro capturado no componente:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-destructive bg-destructive/10 rounded border border-destructive/20 my-1">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{this.props.fallbackTitle || "Erro ao apresentar este elemento"}</span>
            <button
              onClick={this.handleReset}
              className="underline hover:opacity-80 text-xs ml-1 cursor-pointer"
            >
              Recarregar
            </button>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center p-4 my-2 rounded-xl border border-destructive/20 bg-destructive/5 text-center text-sm">
          <AlertCircle className="size-6 text-destructive mb-2" />
          <h4 className="font-medium text-foreground text-sm">
            {this.props.fallbackTitle || "Não foi possível carregar este conteúdo"}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {this.props.fallbackMessage ||
              this.state.error?.message ||
              "Ocorreu um erro temporário ao processar esta visualização."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="mt-3 gap-1.5 h-8 text-xs cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
