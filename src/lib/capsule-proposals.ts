/**
 * Extrai propostas estruturadas do bloco ```capsule que o modelo emite.
 * O bloco é removido do texto visível — o utilizador vê linguagem, não JSON.
 */

export type DecisionProposal = {
  key: string;
  title: string;
  description?: string;
  section?: string;
  tags?: string[];
};

export type EntityProposal = {
  key: string;
  name: string;
  entity_type: string;
  description?: string;
};

export type CapsuleProposals = {
  clean: string;
  decisions: DecisionProposal[];
  entities: EntityProposal[];
};

const BLOCK = /```capsule\s*([\s\S]*?)```/g;
/** Compatibilidade com o formato antigo de tags. */
const LEGACY_TAG = /<connector_action\b[^>]*?\/>/g;

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

export function parseProposals(text: string): CapsuleProposals {
  const decisions: DecisionProposal[] = [];
  const entities: EntityProposal[] = [];
  const blocks = text.match(BLOCK) ?? [];

  blocks.forEach((block, blockIndex) => {
    const json = block.replace(/```capsule\s*/, "").replace(/```$/, "");
    let parsed: { decisions?: unknown; entities?: unknown };
    try {
      parsed = JSON.parse(json) as { decisions?: unknown; entities?: unknown };
    } catch {
      return;
    }
    if (Array.isArray(parsed.decisions)) {
      parsed.decisions.slice(0, 20).forEach((raw, index) => {
        const row = raw as Record<string, unknown>;
        const title = str(row["title"], 300);
        if (!title) return;
        decisions.push({
          key: `d-${blockIndex}-${index}-${title.slice(0, 24)}`,
          title,
          ...(str(row["description"], 4000) ? { description: str(row["description"], 4000)! } : {}),
          ...(str(row["section"], 80) ? { section: str(row["section"], 80)! } : {}),
          ...(Array.isArray(row["tags"])
            ? {
                tags: (row["tags"] as unknown[])
                  .map((tag) => str(tag, 40))
                  .filter((tag): tag is string => Boolean(tag))
                  .slice(0, 12),
              }
            : {}),
        });
      });
    }
    if (Array.isArray(parsed.entities)) {
      parsed.entities.slice(0, 20).forEach((raw, index) => {
        const row = raw as Record<string, unknown>;
        const name = str(row["name"], 160);
        if (!name) return;
        entities.push({
          key: `e-${blockIndex}-${index}-${name.slice(0, 24)}`,
          name,
          entity_type: str(row["entity_type"], 60) ?? "note",
          ...(str(row["description"], 4000) ? { description: str(row["description"], 4000)! } : {}),
        });
      });
    }
  });

  const clean = text
    .replace(BLOCK, "")
    .replace(LEGACY_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { clean, decisions, entities };
}

/** Esconde o bloco enquanto a resposta ainda está a chegar. */
export function stripPartialBlock(text: string): string {
  const withoutInternalBlocks = text
    .replace(/```capsule[\s\S]*$/, "")
    .replace(/<connector_action[\s\S]*$/, "")
    .trimEnd();

  const openChartTag = withoutInternalBlocks.lastIndexOf("<griot_chart>");
  const closedChartTag = withoutInternalBlocks.lastIndexOf("</griot_chart>");
  if (openChartTag > closedChartTag) {
    return withoutInternalBlocks.slice(0, openChartTag).trimEnd();
  }

  const fencePattern =
    /```(?:chart(?::[^\r\n]*)?|griot-chart|graph|recharts|barchart|linechart|json)[ \t]*\r?\n/gi;
  let lastOpenFence = -1;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(withoutInternalBlocks)) !== null) {
    const remainder = withoutInternalBlocks.slice(fencePattern.lastIndex);
    const closingOffset = remainder.indexOf("```");
    if (closingOffset < 0) lastOpenFence = match.index;
  }

  return lastOpenFence >= 0
    ? withoutInternalBlocks.slice(0, lastOpenFence).trimEnd()
    : withoutInternalBlocks;
}
