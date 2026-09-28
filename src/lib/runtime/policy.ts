/**
 * GRIOT Policy & Security Guard.
 * Client policy is UX protection only; the remote runner must enforce the same
 * or stricter policy server-side.
 */

import { GriotAction, RiskLevel } from "./protocol";

export type SecurityPolicyConfig = {
  autoApproveSafe: boolean;
  autoApproveSensitive: boolean;
  blockDangerous: boolean;
  allowedDirectories: string[];
  blockedCommands: string[];
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  autoApproveSafe: true,
  autoApproveSensitive: false,
  blockDangerous: true,
  allowedDirectories: ["src/", "public/", "docs/", "tests/", "package.json"],
  blockedCommands: [
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "fdisk",
    ":(){ :|:& };:",
    "dd if=",
    "> /dev/sda",
    "chmod -r 777 /",
    "git push --force",
    "git reset --hard",
  ],
};

const PATH_KEYS = ["path", "file", "cwd", "workdir"] as const;

export class PolicyGuard {
  private config: SecurityPolicyConfig;

  constructor(config: Partial<SecurityPolicyConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_POLICY, ...config };
  }

  evaluate(action: GriotAction): {
    allowed: boolean;
    requiresUserApproval: boolean;
    reason?: string;
  } {
    if (!action?.type || !action?.id) {
      return { allowed: false, requiresUserApproval: false, reason: "Ação inválida." };
    }

    const pathViolation = this.findPathViolation(action);
    if (pathViolation) {
      return { allowed: false, requiresUserApproval: false, reason: pathViolation };
    }

    const cmd = String(action.params.command || "")
      .trim()
      .toLowerCase();
    const blocked = this.config.blockedCommands.some((rule) => cmd.includes(rule));

    if (blocked || action.risk === "dangerous") {
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: blocked
          ? "Comando bloqueado pelas políticas de segurança do GRIOT."
          : "Ação classificada como perigosa e bloqueada no cliente.",
      };
    }

    if (action.risk === "sensitive") {
      return {
        allowed: true,
        requiresUserApproval: !this.config.autoApproveSensitive,
        reason: this.config.autoApproveSensitive
          ? undefined
          : "Ação com impacto no projeto. Confirmação explícita obrigatória.",
      };
    }

    return { allowed: true, requiresUserApproval: !this.config.autoApproveSafe };
  }

  private findPathViolation(action: GriotAction): string | null {
    for (const key of PATH_KEYS) {
      const value = action.params[key];
      if (typeof value !== "string" || !value.trim()) continue;
      const raw = value.trim().replaceAll("\\", "/");
      if (raw.startsWith("/") || raw.startsWith("~") || raw.includes("../") || raw === "..") {
        return `Caminho fora do workspace permitido: ${value}`;
      }
      const allowed = this.config.allowedDirectories.some((prefix) =>
        prefix.endsWith("/") ? raw.startsWith(prefix) : raw === prefix,
      );
      if (!allowed && action.category === "fs") {
        return `Caminho não permitido pela política do GRIOT: ${value}`;
      }
    }
    return null;
  }
}
