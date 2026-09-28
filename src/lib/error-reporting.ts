import { isExtensionNoise } from "./error-guard";

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (isExtensionNoise(error)) return;
  console.error("[Runtime Error]", error, context);
}
