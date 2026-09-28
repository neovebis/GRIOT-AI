/**
 * Lógica pura do Capsule: máquina de estados das decisões, deteção de conflitos,
 * validação de integridade do Canon e ranking de relevância para o compilador de contexto.
 * Sem I/O — testável isoladamente e reutilizada no servidor.
 */

import type { DecisionStatus } from "./capsule-types";

export type DecisionAction = "propose" | "approve" | "reject" | "supersede" | "restore" | "draft";

export type DecisionLike = {
  id: string;
  title: string;
  description?: string | null;
  status: DecisionStatus;
  section?: string | null;
  tags?: string[] | null;
  reason?: string | null;
  affected_entities?: string[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  version?: number | null;
};

const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  draft: ["proposed", "canonical", "rejected"],
  proposed: ["canonical", "rejected", "draft"],
  canonical: ["superseded", "rejected"],
  rejected: ["proposed", "canonical"],
  superseded: ["canonical"],
};

const ACTION_TARGET: Record<DecisionAction, DecisionStatus> = {
  draft: "draft",
  propose: "proposed",
  approve: "canonical",
  reject: "rejected",
  supersede: "superseded",
  restore: "canonical",
};

export class CapsuleDomainError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_transition" | "conflict" | "validation" | "not_found",
  ) {
    super(message);
    this.name = "CapsuleDomainError";
  }
}

export function canTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Devolve o próximo estado ou lança — nunca transições silenciosas. */
export function nextDecisionStatus(from: DecisionStatus, action: DecisionAction): DecisionStatus {
  const to = ACTION_TARGET[action];
  if (!to) throw new CapsuleDomainError(`Ação desconhecida: ${action}`, "validation");
  if (from === to) return to; // idempotente: aprovar duas vezes não parte nada
  if (!canTransition(from, to)) {
    throw new CapsuleDomainError(`Transição inválida: ${from} → ${to}`, "invalid_transition");
  }
  return to;
}

const STOP_WORDS = new Set([
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "e",
  "que",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "com",
  "para",
  "por",
  "se",
  "é",
  "the",
  "of",
  "and",
  "to",
  "in",
  "is",
  "it",
  "this",
  "that",
  "um",
  "uns",
]);

export function tokenize(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  setA.forEach((token) => {
    if (setB.has(token)) shared += 1;
  });
  return shared / (setA.size + setB.size - shared);
}

export type Conflict = {
  existing: DecisionLike;
  score: number;
  kind: "duplicate" | "contradiction";
};

/**
 * Deteta possíveis conflitos entre uma proposta e o Canon existente.
 * Duplicado: praticamente o mesmo título. Contradição: mesmo sujeito/secção com conteúdo diferente.
 */
export function detectConflicts(
  canon: DecisionLike[],
  proposal: { title: string; description?: string | null; section?: string | null },
  threshold = 0.45,
): Conflict[] {
  const titleTokens = tokenize(proposal.title);
  const bodyTokens = tokenize(`${proposal.title} ${proposal.description ?? ""}`);
  const conflicts: Conflict[] = [];

  for (const existing of canon) {
    if (existing.status !== "canonical") continue;
    const existingTitle = tokenize(existing.title);
    const existingBody = tokenize(`${existing.title} ${existing.description ?? ""}`);
    const titleScore = jaccard(titleTokens, existingTitle);
    const bodyScore = jaccard(bodyTokens, existingBody);
    const sameSection =
      (existing.section ?? "").trim().toLowerCase() ===
      (proposal.section ?? "").trim().toLowerCase();

    if (titleScore >= 0.8) {
      conflicts.push({ existing, score: titleScore, kind: "duplicate" });
      continue;
    }
    const score = titleScore * 0.7 + bodyScore * 0.3 + (sameSection ? 0.1 : 0);
    if (score >= threshold) conflicts.push({ existing, score, kind: "contradiction" });
  }

  return conflicts.sort((a, b) => b.score - a.score).slice(0, 5);
}

export type IntegrityIssue = { code: string; message: string; severity: "error" | "warning" };

/** Verificações práticas antes de promover algo a Canon. */
export function validatePromotion(input: {
  decision: DecisionLike;
  canon: DecisionLike[];
  knownEntityIds: string[];
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const { decision, canon, knownEntityIds } = input;

  if (!decision.title || decision.title.trim().length < 2) {
    issues.push({
      code: "empty_title",
      message: "A decisão precisa de um título.",
      severity: "error",
    });
  }
  if (decision.title && decision.title.length > 300) {
    issues.push({ code: "title_too_long", message: "Título demasiado longo.", severity: "error" });
  }
  if (decision.status === "rejected" && !decision.reason) {
    issues.push({
      code: "missing_reason",
      message: "Rejeições devem registar um motivo.",
      severity: "warning",
    });
  }
  const unknown = (decision.affected_entities ?? []).filter((id) => !knownEntityIds.includes(id));
  if (unknown.length > 0) {
    issues.push({
      code: "unknown_entity",
      message: `Referência a entidades inexistentes: ${unknown.length}.`,
      severity: "error",
    });
  }
  const conflicts = detectConflicts(canon, decision);
  for (const conflict of conflicts) {
    issues.push({
      code: conflict.kind === "duplicate" ? "duplicate" : "possible_conflict",
      message:
        conflict.kind === "duplicate"
          ? `Já existe em Canon: “${conflict.existing.title}”.`
          : `Pode contradizer Canon: “${conflict.existing.title}”.`,
      severity: conflict.kind === "duplicate" ? "error" : "warning",
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Ranking para o compilador de contexto
// ---------------------------------------------------------------------------

export type RankedItem<T> = { item: T; score: number; text: string };

const STATUS_WEIGHT: Record<string, number> = {
  canonical: 1,
  proposed: 0.35,
  draft: 0.2,
  superseded: 0.12,
  rejected: 0.25,
  reference: 0.6,
  archived: 0.1,
};

function recencyBoost(iso?: string | null): number {
  if (!iso) return 0;
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (Number.isNaN(days)) return 0;
  return Math.max(0, 0.25 - days * 0.01);
}

/** Pontua por relevância lexical + estado + recência + entidades em foco. */
export function rankItems<T extends { status?: string | null; updated_at?: string | null }>(
  items: T[],
  toText: (item: T) => string,
  query: string,
  options: { focusTokens?: string[]; statusWeight?: Record<string, number> } = {},
): RankedItem<T>[] {
  const queryTokens = tokenize(query);
  const focus = options.focusTokens ?? [];
  const weights = { ...STATUS_WEIGHT, ...(options.statusWeight ?? {}) };

  return items
    .map((item) => {
      const text = toText(item);
      const tokens = tokenize(text);
      const lexical = jaccard(queryTokens, tokens);
      const overlap =
        queryTokens.length === 0
          ? 0
          : queryTokens.filter((token) => tokens.includes(token)).length / queryTokens.length;
      const focusHit = focus.some((token) => tokens.includes(token)) ? 0.5 : 0;
      const status = weights[item.status ?? "canonical"] ?? 0.5;
      const score =
        (lexical * 0.4 + overlap * 0.6 + focusHit) * status + recencyBoost(item.updated_at);
      return { item, score, text };
    })
    .sort((a, b) => b.score - a.score);
}

/** ~4 caracteres por token — suficiente para respeitar orçamentos sem tokenizer real. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Preenche uma secção respeitando o orçamento e removendo duplicados. */
export function fitToBudget<T>(
  ranked: RankedItem<T>[],
  budgetTokens: number,
  minScore = 0.001,
): { lines: string[]; used: number } {
  const lines: string[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const entry of ranked) {
    if (entry.score < minScore) continue;
    const key = entry.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    const cost = estimateTokens(entry.text);
    if (used + cost > budgetTokens) continue;
    seen.add(key);
    lines.push(entry.text);
    used += cost;
  }
  return { lines, used };
}
