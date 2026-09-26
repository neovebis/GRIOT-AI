declare module "node:crypto" {
  export function randomUUID(): string;
  export function createHash(algorithm: string): {
    update(data: string, inputEncoding?: string): { digest(encoding: "hex"): string };
    digest(encoding: "hex"): string;
  };
}

declare module "node:fs/promises" {
  export function appendFile(path: string, data: string, encoding?: string): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding?: string): Promise<string>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
  export function readdir(path: string): Promise<string[]>;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:child_process" {
  export interface ChildProcessLike {
    stdout: any;
    stderr: any;
    kill(signal?: string): boolean;
    on(event: string, listener: (...args: any[]) => void): void;
  }
  export function spawn(command: string, args?: readonly string[], options?: Record<string, unknown>): ChildProcessLike;
}

declare const process: {
  readonly env: Record<string, string | undefined>;
  readonly argv: readonly string[];
  readonly stdout: { write(chunk: string): boolean };
};

declare namespace NodeJS {
  interface Timeout {}
  type Signals = string;
  interface ErrnoException extends Error { code?: string; }
}

interface AbortSignal {}
interface AbortController { signal: AbortSignal; abort(): void; }
declare var AbortController: { new(): AbortController };

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): NodeJS.Timeout;
declare function clearTimeout(timeoutId: NodeJS.Timeout): void;

declare function fetch(input: string, init?: RequestInit): Promise<Response>;
interface RequestInit { method?: string; signal?: AbortSignal; headers?: Record<string, string>; body?: string; }
interface Response { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>; }

declare module "node:os" { export function tmpdir(): string; }
