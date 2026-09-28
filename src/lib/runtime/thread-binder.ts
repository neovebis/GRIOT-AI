/**
 * GRIOT Thread Binder & Invisible App Session Manager
 *
 * Garante a vinculação fixa e 1:1 entre uma conversa do GRIOT e uma thread/chat
 * específico na app externa de IA selecionada (ChatGPT, Claude, Gemini, DeepSeek, etc.).
 *
 * Princípio fundamental:
 * - O utilizador escreve e recebe mensagens 100% dentro do GRIOT sem alternar janelas.
 * - Toda a mensagem dentro de uma dada conversa do GRIOT vai estritamente para o mesmo
 *   chat fixado da IA externa (prefixado com [GRIOT] <Título>), mantendo o contexto íntegro.
 */

import { AI_OBSERVER_APPS } from "./apps";

export interface ThreadBinding {
  id: string;
  conversationId: string;
  appId: string;
  appName: string;
  fixedTitle: string;
  externalSessionId?: string;
  createdAt: string;
  lastActiveAt: string;
  status: "connected" | "syncing" | "idle";
  totalMessagesExchanged: number;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = "griot_thread_bindings_v1";

class ThreadBinderManager {
  private static instance: ThreadBinderManager;
  private bindings: Map<string, ThreadBinding> = new Map();

  private constructor() {
    this.load();
  }

  public static getInstance(): ThreadBinderManager {
    if (!ThreadBinderManager.instance) {
      ThreadBinderManager.instance = new ThreadBinderManager();
    }
    return ThreadBinderManager.instance;
  }

  private getKey(conversationId: string, appId: string): string {
    return `${conversationId}::${appId}`;
  }

  private load() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ThreadBinding>;
        for (const [k, v] of Object.entries(parsed)) {
          this.bindings.set(k, v);
        }
      }
    } catch (err) {
      console.warn("Falha ao carregar thread bindings do GRIOT:", err);
    }
  }

  private save() {
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, ThreadBinding> = {};
      for (const [k, v] of this.bindings.entries()) {
        obj[k] = v;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      window.dispatchEvent(
        new CustomEvent("griot:thread-binding-changed", {
          detail: { count: this.bindings.size },
        }),
      );
    } catch (err) {
      console.warn("Falha ao guardar thread bindings:", err);
    }
  }

  /**
   * Obtém a vinculação existente ou cria uma nova vinculação fixa para esta conversa do GRIOT
   */
  public getOrCreateBinding(
    conversationId: string,
    appId: string,
    conversationTitle?: string,
  ): ThreadBinding {
    const key = this.getKey(conversationId, appId);
    const existing = this.bindings.get(key);

    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
      if (conversationTitle && !existing.fixedTitle.includes(conversationTitle.slice(0, 20))) {
        existing.fixedTitle = `[GRIOT] ${conversationTitle.trim()}`;
      }
      this.save();
      return existing;
    }

    const appDef = AI_OBSERVER_APPS[appId];
    const appName = appDef ? appDef.name : appId.toUpperCase();
    const cleanTitle = conversationTitle?.trim() || "Nova Sessão";
    const fixedTitle = `[GRIOT] ${cleanTitle}`;

    const newBinding: ThreadBinding = {
      id: `th_${appId}_${conversationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16)}_${Date.now().toString(36)}`,
      conversationId,
      appId,
      appName,
      fixedTitle,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      status: "connected",
      totalMessagesExchanged: 0,
    };

    this.bindings.set(key, newBinding);
    this.save();
    return newBinding;
  }

  public getBinding(conversationId: string, appId: string): ThreadBinding | null {
    const key = this.getKey(conversationId, appId);
    return this.bindings.get(key) || null;
  }

  public registerMessageExchange(conversationId: string, appId: string) {
    const key = this.getKey(conversationId, appId);
    const item = this.bindings.get(key);
    if (item) {
      item.totalMessagesExchanged += 1;
      item.lastActiveAt = new Date().toISOString();
      item.status = "connected";
      this.save();
    }
  }

  public listBindingsForConversation(conversationId: string): ThreadBinding[] {
    const list: ThreadBinding[] = [];
    for (const [k, v] of this.bindings.entries()) {
      if (k.startsWith(`${conversationId}::`)) {
        list.push(v);
      }
    }
    return list;
  }

  public unbind(conversationId: string, appId: string) {
    const key = this.getKey(conversationId, appId);
    this.bindings.delete(key);
    this.save();
  }

  public clearAll() {
    this.bindings.clear();
    this.save();
  }
}

export const threadBinder = ThreadBinderManager.getInstance();
