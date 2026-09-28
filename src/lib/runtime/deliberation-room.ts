/**
 * GRIOT AI Deliberation Room Engine (Quick Mode)
 * Multi-role collaborative AI room for ideation, analysis, debate, and strategy.
 */

import { supabase } from "@/integrations/supabase/client";
import { GRIOT_SUPABASE_URL, GRIOT_SUPABASE_ANON_KEY } from "@/lib/griot-api";

export type DeliberationMissionId =
  "ideate" | "analyze" | "debate" | "build" | "business" | "red_team" | "decide";

export interface DeliberationMission {
  id: DeliberationMissionId;
  label: string;
  icon: string;
  description: string;
  defaultRoles: DeliberationRoleId[];
}

export type DeliberationRoleId = "strategist" | "analyst" | "innovator" | "critic";

export interface DeliberationRole {
  id: DeliberationRoleId;
  label: string;
  icon: string;
  duty: string;
  defaultEngine: string; // e.g. "gemini:gemini-3.6-flash", "app:chatgpt"
}

export interface DeliberationState {
  mission: DeliberationMissionId;
  roles: Record<DeliberationRoleId, { engine: string }>;
  activeTurnIndex: number;
  history: DeliberationTurn[];
  verdict: GriotVerdict | null;
}

export interface DeliberationTurn {
  id: string;
  roleId: DeliberationRoleId;
  roleName: string;
  icon: string;
  engineLabel: string;
  content: string;
  timestamp: string;
}

export interface GriotVerdict {
  score: number; // e.g. 7.8
  topOpportunity: string;
  topRisk: string;
  recommendedPivot: string;
  mvpScope: string[];
  nextSteps: string[];
  summary: string;
}

export const DELIBERATION_MISSIONS: DeliberationMission[] = [
  {
    id: "ideate",
    label: "Ideate (Desenvolver Ideia)",
    icon: "lightbulb",
    description: "Gerar, expandir e explorar uma nova visão ou conceito de produto.",
    defaultRoles: ["strategist", "innovator", "critic", "analyst"],
  },
  {
    id: "analyze",
    label: "Analyze (Analisar Riscos)",
    icon: "search",
    description: "Encontrar falhas ocultas, riscos operacionais e restrições técnicas.",
    defaultRoles: ["analyst", "critic", "strategist", "innovator"],
  },
  {
    id: "debate",
    label: "Debate (Confrontar Visões)",
    icon: "swords",
    description: "Confrontar posições opostas para testar a resistência da proposta.",
    defaultRoles: ["critic", "innovator", "analyst", "strategist"],
  },
  {
    id: "build",
    label: "Build (Especificação Técnica)",
    icon: "wrench",
    description: "Transformar o conceito em arquitetura de software e especificação técnica.",
    defaultRoles: ["strategist", "analyst", "innovator", "critic"],
  },
  {
    id: "business",
    label: "Business (Modelo de Negócio)",
    icon: "trending-up",
    description: "Avaliar monetização, custos de operação, precificação e mercado.",
    defaultRoles: ["strategist", "analyst", "critic", "innovator"],
  },
  {
    id: "red_team",
    label: "Red Team (Ataque e Defesa)",
    icon: "flask-conical",
    description: "Uma IA tenta destruir a ideia enquanto outras tentam adaptar e salvar.",
    defaultRoles: ["critic", "innovator", "analyst", "strategist"],
  },
  {
    id: "decide",
    label: "Decide (Recomendação Final)",
    icon: "target",
    description: "Avaliar alternativas e entregar um parecer claro de Go / No-Go.",
    defaultRoles: ["strategist", "analyst", "critic", "innovator"],
  },
];

export const DELIBERATION_ROLES: Record<DeliberationRoleId, DeliberationRole> = {
  strategist: {
    id: "strategist",
    label: "Strategist",
    icon: "brain",
    duty: "Pensa no produto, proposta de valor, mercado e visão estratégica.",
    defaultEngine: "gemini:gemini-2.5-flash",
  },
  analyst: {
    id: "analyst",
    label: "Analyst",
    icon: "search",
    duty: "Procura problemas, inconsistências técnicas, custos e riscos.",
    defaultEngine: "openai:gpt-4o",
  },
  innovator: {
    id: "innovator",
    label: "Innovator",
    icon: "lightbulb",
    duty: "Tenta evoluir a ideia, propondo melhorias e recursos diferenciadores.",
    defaultEngine: "gemini:gemini-2.5-flash",
  },
  critic: {
    id: "critic",
    label: "Critic",
    icon: "shield",
    duty: "Desafia duramente as propostas, atrito de adoção e casos limite.",
    defaultEngine: "deepseek:deepseek-r1",
  },
};

/**
 * Generates a role-specific deliberation turn prompt context.
 */
export function buildRoleSystemInstruction(
  roleId: DeliberationRoleId,
  mission: DeliberationMissionId,
  userPrompt: string,
  previousTurns: DeliberationTurn[],
): string {
  const role = DELIBERATION_ROLES[roleId];
  const historyText = previousTurns
    .map((t) => `${t.icon} ${t.roleName}: ${t.content}`)
    .join("\n\n");

  return `[GRIOT AI Deliberation Room - Role: ${role.label}]
Missão: ${mission}
Função: ${role.duty}

Instruções:
- Tu estás numa sala de deliberação com outros especialistas de IA.
- Mantém o foco estrito na tua função (${role.label}).
- Não repitas o que os outros disseram: reage diretamente, concorda, discorda ou aprofunda o ponto anterior.
- Responde de forma direta, concisa (máximo 3 parágrafos) e fundamentada.

Histórico do Debate:
${historyText || "(Início da deliberação)"}

Tópico Principal / Pergunta do Utilizador:
"${userPrompt}"`;
}

/**
 * Formats a GRIOT Verdict based on the deliberation turn history.
 */
export function buildVerdictPrompt(userPrompt: string, turns: DeliberationTurn[]): string {
  const historyText = turns.map((t) => `${t.roleName}: ${t.content}`).join("\n\n");

  return `[GRIOT Verdict Generation]
Analisa o debate realizado na sala e produz a síntese final no formato JSON exato:

{
  "score": 7.8,
  "topOpportunity": "Descrição da maior oportunidade",
  "topRisk": "Descrição do maior risco",
  "recommendedPivot": "Alteração ou ajuste recomendado",
  "mvpScope": ["Recurso 1", "Recurso 2", "Recurso 3"],
  "nextSteps": ["Passo 1", "Passo 2", "Passo 3"],
  "summary": "Resumo sintético do veredito final"
}

Debate Realizado:
${historyText}

Tópico Original:
"${userPrompt}"`;
}
