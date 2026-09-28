/**
 * GRIOT Interactive Terminal & PTY Streaming Simulator
 *
 * Provides real-time, line-by-line event streaming for long-running processes,
 * interactive prompts simulation, process cancellation (SIGINT/abort), and terminal history buffers.
 */

export type TerminalStreamEvent =
  | { type: "stdout"; text: string; timestamp: number }
  | { type: "stderr"; text: string; timestamp: number }
  | { type: "status"; status: "running" | "completed" | "aborted" | "error"; exitCode?: number }
  | { type: "prompt"; query: string; defaultOption?: string };

export interface TerminalSession {
  id: string;
  command: string;
  startedAt: number;
  status: "running" | "completed" | "aborted" | "error";
  exitCode?: number;
  buffer: string[];
  abortController: AbortController;
  listeners: Set<(evt: TerminalStreamEvent) => void>;
}

const activeSessions = new Map<string, TerminalSession>();

/**
 * Inicia uma sessão de terminal com streaming interativo.
 */
export function createTerminalSession(command: string): TerminalSession {
  const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const abortController = new AbortController();

  const session: TerminalSession = {
    id: sessionId,
    command,
    startedAt: Date.now(),
    status: "running",
    buffer: [],
    abortController,
    listeners: new Set(),
  };

  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Subscreve aos eventos em tempo real da sessão do terminal.
 */
export function subscribeTerminalSession(
  sessionId: string,
  callback: (evt: TerminalStreamEvent) => void,
): () => void {
  const session = activeSessions.get(sessionId);
  if (!session) return () => {};

  session.listeners.add(callback);
  return () => {
    session.listeners.delete(callback);
  };
}

/**
 * Emite uma linha de log para a sessão ativa.
 */
export function emitTerminalEvent(sessionId: string, evt: TerminalStreamEvent): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (evt.type === "stdout" || evt.type === "stderr") {
    session.buffer.push(evt.text);
    if (session.buffer.length > 1000) session.buffer.shift();
  }

  if (evt.type === "status") {
    session.status = evt.status;
    session.exitCode = evt.exitCode;
  }

  session.listeners.forEach((listener) => {
    try {
      listener(evt);
    } catch (e) {
      console.warn("[Terminal Streamer] Listener error:", e);
    }
  });
}

/**
 * Cancela/aborta uma sessão de terminal ativa (SIGINT).
 */
export function killTerminalSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  session.abortController.abort();
  emitTerminalEvent(sessionId, {
    type: "stderr",
    text: "\n^C [Process terminated by user with SIGINT]",
    timestamp: Date.now(),
  });
  emitTerminalEvent(sessionId, {
    type: "status",
    status: "aborted",
    exitCode: 130,
  });

  return true;
}

/**
 * Obtém a sessão ativa ou seu buffer consolidado.
 */
export function getTerminalSession(sessionId: string): TerminalSession | undefined {
  return activeSessions.get(sessionId);
}
