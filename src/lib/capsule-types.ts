/**
 * Capsule Engine — núcleo comum + módulos especializados por tipo.
 * Um único motor (secções, boards, campos, assets, entidades, relações, widgets);
 * cada tipo de Cápsula declara apenas os módulos que usa.
 */

export type CapsuleType = "story" | "manga" | "design" | "brand" | "school" | "custom";

export type DecisionStatus = "draft" | "proposed" | "canonical" | "rejected" | "superseded";
export type EntityStatus = "canonical" | "draft" | "archived";
export type AssetStatus = "canonical" | "reference" | "draft" | "archived" | "rejected";
export type PhaseStatus = "pending" | "current" | "completed";

export type CapsuleModule =
  | "chat"
  | "canon"
  | "entities"
  | "assets"
  | "timeline"
  | "countdown"
  | "subjects"
  | "contentBoard"
  | "characterBoard"
  | "locationBoard"
  | "inspirationBoard"
  | "chapters";

export type EntityTypeSpec = {
  id: string;
  label: string;
  /** Campos sugeridos — todos opcionais, nunca formulários obrigatórios. */
  fields?: string[];
  board?: boolean;
};

export type CapsuleTypeSpec = {
  id: CapsuleType;
  label: string;
  hint: string;
  modules: CapsuleModule[];
  phases: string[];
  sections: string[];
  entityTypes: EntityTypeSpec[];
};

const CHARACTER_FIELDS = [
  "Alias",
  "Idade",
  "Papel",
  "Personalidade",
  "Motivações",
  "Poder / Habilidade",
  "Fraquezas",
  "Notas",
];

const LOCATION_FIELDS = ["Descrição", "Importância", "Atmosfera", "Notas"];

export const CAPSULE_TYPES: Record<CapsuleType, CapsuleTypeSpec> = {
  story: {
    id: "story",
    label: "História",
    hint: "Romance, argumento, worldbuilding",
    modules: ["chat", "canon", "entities", "assets", "timeline"],
    phases: ["Conceito", "Worldbuilding", "Personagens", "Trama", "Arco 1", "Capítulo 1"],
    sections: ["World", "Personagens", "Lore", "Trama", "Regras"],
    entityTypes: [
      { id: "character", label: "Personagem", fields: CHARACTER_FIELDS, board: true },
      { id: "location", label: "Local", fields: LOCATION_FIELDS, board: true },
      { id: "faction", label: "Facção" },
      { id: "object", label: "Objeto" },
      { id: "event", label: "Acontecimento" },
      { id: "species", label: "Espécie" },
      { id: "power", label: "Poder" },
      { id: "rule", label: "Regra" },
      { id: "chapter", label: "Capítulo" },
      { id: "arc", label: "Arco" },
    ],
  },
  manga: {
    id: "manga",
    label: "Mangá",
    hint: "Personagens, capítulos, arte",
    modules: [
      "chat",
      "canon",
      "entities",
      "characterBoard",
      "locationBoard",
      "chapters",
      "assets",
      "timeline",
    ],
    phases: ["Conceito", "Worldbuilding", "Designs", "Storyboard", "Capítulo 1"],
    sections: ["World", "Personagens", "Locais", "Capítulos", "Visual"],
    entityTypes: [
      { id: "character", label: "Personagem", fields: CHARACTER_FIELDS, board: true },
      { id: "location", label: "Local", fields: LOCATION_FIELDS, board: true },
      { id: "chapter", label: "Capítulo" },
      { id: "page", label: "Página" },
      { id: "scene", label: "Cena" },
      { id: "panel", label: "Conceito de painel" },
      { id: "visual_reference", label: "Referência visual" },
    ],
  },
  design: {
    id: "design",
    label: "Design",
    hint: "Conceito, inspiração, ecrãs",
    modules: ["chat", "canon", "entities", "inspirationBoard", "assets", "timeline"],
    phases: ["Conceito", "Ideias", "Fluxo", "Alta fidelidade", "Entrega"],
    sections: ["Concept", "Idea", "Inspiration", "Regras", "Ecrãs"],
    entityTypes: [
      { id: "screen", label: "Ecrã", board: true },
      { id: "component", label: "Componente" },
      { id: "design_rule", label: "Regra de design" },
      { id: "interaction", label: "Interação" },
      { id: "flow", label: "Fluxo" },
      { id: "visual_reference", label: "Referência visual" },
    ],
  },
  brand: {
    id: "brand",
    label: "Marca",
    hint: "Identidade, voz, sistema visual",
    modules: ["chat", "canon", "entities", "inspirationBoard", "assets", "timeline"],
    phases: ["Discovery", "Posicionamento", "Identidade", "Sistema visual", "Lançamento"],
    sections: ["Vision", "Audience", "Personality", "Voice", "Visual", "Logo"],
    entityTypes: [
      { id: "brand_principle", label: "Princípio" },
      { id: "audience", label: "Audiência" },
      { id: "voice", label: "Voz" },
      { id: "visual_rule", label: "Regra visual" },
      { id: "campaign", label: "Campanha" },
      { id: "logo_asset", label: "Logótipo", board: true },
      { id: "typography", label: "Tipografia" },
      { id: "color_system", label: "Cor" },
    ],
  },
  school: {
    id: "school",
    label: "Escola",
    hint: "Trabalhos, pesquisa, apresentações",
    modules: [
      "chat",
      "canon",
      "entities",
      "countdown",
      "subjects",
      "contentBoard",
      "assets",
      "timeline",
    ],
    phases: ["Enquadramento", "Pesquisa", "Experiência", "Escrita", "Apresentação"],
    sections: ["Overview", "Introdução", "Pesquisa", "Experiência", "Apresentação", "Fontes"],
    entityTypes: [
      { id: "subject", label: "Disciplina" },
      { id: "requirement", label: "Requisito" },
      { id: "source", label: "Fonte" },
      { id: "experiment", label: "Experiência", board: true },
      { id: "note", label: "Nota" },
    ],
  },
  custom: {
    id: "custom",
    label: "Personalizada",
    hint: "Estrutura livre",
    modules: ["chat", "canon", "entities", "contentBoard", "assets", "timeline"],
    phases: ["Início"],
    sections: ["Geral"],
    entityTypes: [
      { id: "note", label: "Nota", board: true },
      { id: "reference", label: "Referência" },
    ],
  },
};

export const CAPSULE_TYPE_LIST = Object.values(CAPSULE_TYPES);

export function typeSpec(type: string | null | undefined): CapsuleTypeSpec {
  return CAPSULE_TYPES[(type as CapsuleType) ?? "custom"] ?? CAPSULE_TYPES.custom;
}

export function hasModule(type: string | null | undefined, module: CapsuleModule): boolean {
  return typeSpec(type).modules.includes(module);
}

export function entityTypeLabel(type: string | null | undefined, entityType: string): string {
  return typeSpec(type).entityTypes.find((e) => e.id === entityType)?.label ?? entityType;
}

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  draft: "Rascunho",
  proposed: "Proposta",
  canonical: "Canon",
  rejected: "Rejeitada",
  superseded: "Substituída",
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  canonical: "Canon",
  reference: "Referência",
  draft: "Rascunho",
  archived: "Arquivado",
  rejected: "Rejeitado",
};
