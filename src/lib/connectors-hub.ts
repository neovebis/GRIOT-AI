/**
 * GRIOT Universal Connectors Hub (Lotes 1 a 6 - 30 Conectores Oficiais)
 * 
 * Orquestrador central que recebe chamadas de:
 * 1. Chamada Semântica via Tag: <connector_action connector="..." action="..." params='...' />
 * 2. Ferramenta de Função Nativa: call_connector(connector, action, params)
 * 3. Ações do Runtime do GRIOT: GriotAction (connector.execute)
 * 
 * Normaliza ações em dot-notation (ex: "github.contents.write_file" -> "contents.write_file")
 * e roteia com máxima fidelidade para as APIs reais de produção.
 */

import { type ConnectorExecutionContext, type ConnectorResult } from "./connectors-batch1";
import { executeLot1Extended } from "./connectors-lot1-extended";
import { executeBatch2Connector } from "./connectors-batch2";
import { executeBatch3Connector } from "./connectors-batch3";
import { executeBatch4Connector } from "./connectors-batch4";
import { executeBatch5Connector } from "./connectors-batch5";
import { executeBatch6Connector } from "./connectors-batch6";
import {
  executeDiscord,
  executeTelegram,
  executeTwilio,
  executeResend,
  executeAirtable,
  executePinecone,
  executeJira,
  executeAws,
  executeDigitalOcean,
  executeShopify,
  executePostHog,
} from "./connectors-lot2-lot6";
import { getConnectedPlugins, resolveActivePluginCredentials } from "./plugins-service";

/**
 * Normaliza o ID do conector para a chave canônica correspondente
 */
export function normalizeConnectorId(connector: string): string {
  const c = (connector || "").toLowerCase().trim();

  // LOTE 1
  if (c === "github" || c === "gh") return "github";
  if (c === "gitlab" || c === "gl") return "gitlab";
  if (c === "vercel" || c === "now") return "vercel";
  if (c === "supabase" || c === "sb") return "supabase";
  if (c === "firebase" || c === "fb" || c === "firestore") return "firebase";

  // LOTE 2
  if (c === "discord") return "discord";
  if (c === "slack") return "slack";
  if (c === "telegram" || c === "tg") return "telegram";
  if (c === "twilio" || c === "whatsapp" || c === "sms") return "twilio";
  if (c === "resend" || c === "sendgrid") return "resend";

  // LOTE 3
  if (c === "postgresql" || c === "postgres" || c === "pg" || c === "neon") return "postgresql";
  if (c === "redis" || c === "upstash") return "redis";
  if (c === "mongodb" || c === "mongo" || c === "mongodb_atlas") return "mongodb";
  if (c === "airtable") return "airtable";
  if (c === "pinecone") return "pinecone";
  if (c === "qdrant") return "qdrant";

  // LOTE 4
  if (c === "notion") return "notion";
  if (c === "google_drive" || c === "gdrive" || c === "googledrive") return "google_drive";
  if (c === "trello") return "trello";
  if (c === "jira" || c === "atlassian") return "jira";
  if (c === "linear" || c === "linear_app") return "linear";

  // LOTE 5
  if (c === "aws" || c === "s3" || c === "lambda") return "aws";
  if (c === "cloudflare" || c === "cf" || c === "d1") return "cloudflare";
  if (c === "digitalocean" || c === "do") return "digitalocean";
  if (c === "huggingface" || c === "hf") return "huggingface";
  if (c === "dockerhub" || c === "docker" || c === "docker_hub") return "dockerhub";

  // LOTE 6
  if (c === "stripe") return "stripe";
  if (c === "shopify") return "shopify";
  if (c === "google_analytics" || c === "ga4" || c === "analytics") return "google_analytics";
  if (c === "posthog") return "posthog";
  if (c === "sentry") return "sentry";

  // Aliases adicionais preservados
  if (c === "sheets" || c === "google_sheets" || c === "googlesheets") return "google_sheets";
  if (c === "figma") return "figma";
  if (c === "gmail") return "gmail";
  if (c === "outlook" || c === "microsoft_outlook") return "outlook";
  if (c === "dropbox") return "dropbox";
  if (c === "planetscale" || c === "pscale") return "planetscale";
  if (c === "azure" || c === "microsoft_azure") return "azure";
  if (c === "salesforce" || c === "sfdc") return "salesforce";
  if (c === "colab" || c === "google_colab") return "google_colab";
  if (c === "canva") return "canva";

  return c;
}

/**
 * Normaliza a ação removendo prefixos de namespace redundantes do conector (ex: "github.contents.write_file" -> "contents.write_file")
 * Preserva intactos os namespaces dos recursos (ex: "repos.create", "contents.read_file", "db.raw_sql", "firestore.get_document").
 */
export function normalizeActionName(rawAction: string, canonicalConnectorId: string): string {
  let action = (rawAction || "").trim();
  // Remove APENAS o prefixo do conector se estiver redundante (ex: "github.repos.create" -> "repos.create")
  // JAMAIS remover prefixos de recursos funcionais como "repos.", "contents.", "pulls.", "issues.", "db.", etc.
  const connectorPrefixes = [
    canonicalConnectorId,
    "github", "gitlab", "vercel", "supabase", "firebase",
    "discord", "slack", "telegram", "twilio", "resend",
    "postgresql", "redis", "mongodb", "airtable", "pinecone", "qdrant",
    "notion", "google_drive", "trello", "jira", "linear",
    "aws", "cloudflare", "digitalocean", "huggingface", "dockerhub",
    "stripe", "shopify", "google_analytics", "posthog", "sentry",
    "gh", "gl", "sb", "fb", "tg", "cf", "do"
  ].join("|");
  const prefixRegex = new RegExp(`^(${connectorPrefixes})\\.`, "i");
  if (prefixRegex.test(action)) {
    action = action.replace(prefixRegex, "");
  }
  return action;
}

/**
 * Normaliza parâmetros para compatibilidade universal bidirecional camelCase <=> snake_case.
 * Garante que qualquer conector encontre o parâmetro independentemente da convenção usada.
 */
export function normalizeConnectorParams(rawParams: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!rawParams || typeof rawParams !== "object") return {};
  const normalized: Record<string, unknown> = { ...rawParams };

  for (const [key, value] of Object.entries(rawParams)) {
    if (key.includes("_")) {
      const camel = key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
      if (normalized[camel] === undefined) {
        normalized[camel] = value;
      }
    }
    const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    if (snake !== key && normalized[snake] === undefined) {
      normalized[snake] = value;
    }
  }

  // Aliases universais comuns entre LLMs e APIs REST
  if (normalized.id && !normalized.projectId && !normalized.project_id) {
    normalized.projectId = normalized.id;
    normalized.project_id = normalized.id;
  }
  if (normalized.base && !normalized.baseId && !normalized.base_id) {
    normalized.baseId = normalized.base;
    normalized.base_id = normalized.base;
  }
  if (normalized.table && !normalized.tableId && !normalized.table_id) {
    normalized.tableId = normalized.table;
    normalized.table_id = normalized.table;
  }
  if (normalized.channel && !normalized.channelId && !normalized.channel_id) {
    normalized.channelId = normalized.channel;
    normalized.channel_id = normalized.channel;
  }
  if (normalized.message && !normalized.content && !normalized.text) {
    normalized.content = normalized.message;
    normalized.text = normalized.message;
  }
  if (normalized.content && !normalized.message && !normalized.text) {
    normalized.message = normalized.content;
    normalized.text = normalized.content;
  }

  return normalized;
}

/**
 * Ponto de entrada universal para execução de qualquer um dos 30 Conectores Oficiais
 */
export async function executeUniversalConnector(
  connectorNameOrId: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorResult> {
  const normId = normalizeConnectorId(connectorNameOrId);
  const normalizedAction = normalizeActionName(ctx.action, normId);

  // Recupera credencial e conta salva caso não tenham sido passadas no contexto
  let credential = ctx.credential?.trim() || "";
  let account = ctx.account?.trim() || "";

  if (!credential || !account) {
    const creds = resolveActivePluginCredentials(normId);
    if (!credential) credential = creds.apiKey || "";
    if (!account) account = creds.accountName || creds.projectRef || creds.customEndpoint || "";
  }

  const effectiveCtx: ConnectorExecutionContext = {
    credential,
    account: account || ctx.account,
    action: normalizedAction || ctx.action,
    params: normalizeConnectorParams(ctx.params),
  };

  switch (normId) {
    // ==========================================
    // LOTE 1: DESENVOLVIMENTO, INFRA & CODE REPOS
    // ==========================================
    case "github":
    case "gitlab":
    case "vercel":
    case "supabase":
    case "firebase":
      return executeLot1Extended(normId, effectiveCtx);

    // ==========================================
    // LOTE 2: COMUNICAÇÃO, NOTIFICAÇÕES & MENSAGERIA
    // ==========================================
    case "discord":
      return executeDiscord(effectiveCtx);

    case "slack":
      return executeBatch3Connector("slack", effectiveCtx);

    case "telegram":
      return executeTelegram(effectiveCtx);

    case "twilio":
      return executeTwilio(effectiveCtx);

    case "resend":
      return executeResend(effectiveCtx);

    // ==========================================
    // LOTE 3: BASES DE DADOS, CACHE & VETORES
    // ==========================================
    case "postgresql":
      return executeBatch2Connector("neon", effectiveCtx);

    case "redis":
      return executeBatch2Connector("upstash", effectiveCtx);

    case "mongodb":
      return executeBatch2Connector("mongodb", effectiveCtx);

    case "airtable":
      return executeAirtable(effectiveCtx);

    case "pinecone":
      return executePinecone(effectiveCtx);

    case "qdrant":
      return executeBatch2Connector("qdrant", effectiveCtx);

    // ==========================================
    // LOTE 4: PRODUTIVIDADE, DOCS & TAREFAS
    // ==========================================
    case "notion":
      return executeBatch3Connector("notion", effectiveCtx);

    case "google_drive":
      return executeBatch4Connector("google_drive", effectiveCtx);

    case "trello":
      return executeBatch3Connector("trello", effectiveCtx);

    case "jira":
      return executeJira(effectiveCtx);

    case "linear":
      return executeBatch3Connector("linear", effectiveCtx);

    // ==========================================
    // LOTE 5: CLOUD COMPUTING & CONTAINERS
    // ==========================================
    case "aws":
      return executeAws(effectiveCtx);

    case "cloudflare":
      return executeBatch2Connector("cloudflare", effectiveCtx);

    case "digitalocean":
      return executeDigitalOcean(effectiveCtx);

    case "huggingface":
      return executeBatch5Connector("huggingface", effectiveCtx);

    case "dockerhub":
      return executeBatch4Connector("dockerhub", effectiveCtx);

    // ==========================================
    // LOTE 6: MONETIZAÇÃO, ANALYTICS & MONITORIZAÇÃO
    // ==========================================
    case "stripe":
      return executeBatch4Connector("stripe", effectiveCtx);

    case "shopify":
      return executeShopify(effectiveCtx);

    case "google_analytics":
      return executeBatch6Connector("google_analytics", effectiveCtx);

    case "posthog":
      return executePostHog(effectiveCtx);

    case "sentry":
      return executeBatch3Connector("sentry", effectiveCtx);

    // Extras & Compatibilidade Legada
    case "google_sheets":
      return executeBatch4Connector("google_sheets", effectiveCtx);
    case "figma":
      return executeBatch4Connector("figma", effectiveCtx);
    case "gmail":
      return executeBatch5Connector("gmail", effectiveCtx);
    case "outlook":
      return executeBatch5Connector("outlook", effectiveCtx);
    case "dropbox":
      return executeBatch5Connector("dropbox", effectiveCtx);
    case "planetscale":
      return executeBatch5Connector("planetscale", effectiveCtx);
    case "azure":
      return executeBatch6Connector("azure", effectiveCtx);
    case "salesforce":
      return executeBatch6Connector("salesforce", effectiveCtx);
    case "google_colab":
      return executeBatch6Connector("google_colab", effectiveCtx);
    case "canva":
      return executeBatch6Connector("canva", effectiveCtx);

    default:
      return {
        success: false,
        error: `Conector '${connectorNameOrId}' não suportado.`,
        summary: `⚠️ **Conector Não Reconhecido:** '${connectorNameOrId}'. O GRIOT suporta nativamente os 30 conectores oficiais dos 6 Lotes (GitHub, GitLab, Vercel, Supabase, Firebase, Discord, Slack, Telegram, Twilio, Resend, PostgreSQL, Redis, MongoDB, Airtable, Pinecone, Notion, Google Drive, Trello, Jira, Linear, AWS, Cloudflare, DigitalOcean, Hugging Face, Docker Hub, Stripe, Shopify, Google Analytics, PostHog, Sentry).`,
      };
  }
}
