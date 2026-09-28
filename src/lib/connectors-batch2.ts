/* eslint-disable max-lines */
/**
 * GRIOT Mobile Connector Engine - Lote 2: Bases de Dados, Cache & Vetores
 * 
 * Implementação completa de produção para:
 * 1. Neon Postgres (Serverless Postgres, branches, projetos)
 * 2. Upstash Redis (Serverless Redis REST: get, set, del, keys, ping, stats)
 * 3. MongoDB Atlas (Data API / NoSQL: find, find_one, insert_one, collections)
 * 4. Cloudflare (API v4: D1 SQL, Workers, DNS zones, verificação de token, Pages)
 * 5. Qdrant (Vector Database: collections, search, points count, telemetria)
 */

import { safeFetch, handleHttpError } from "./connector-http";

export interface ConnectorExecutionContext {
  credential: string;
  action: string;
  params: Record<string, unknown>;
  accountName?: string;
  customEndpoint?: string;
}

export interface ConnectorExecutionResponse {
  success: boolean;
  connector: string;
  action: string;
  summary: string;
  data?: unknown;
  error?: string;
}

// ============================================================================
// 1. NEON POSTGRES CONNECTOR
// ============================================================================

export async function executeNeon(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "neon",
      action: ctx.action,
      summary:
        "⚠️ **Neon Postgres Não Conectado**: Adiciona a tua API Key em Definições → Plugins → Neon Postgres.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://console.neon.tech/api/v2";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    switch (ctx.action) {
      case "list_projects": {
        const res = await fetch(`${BASE_URL}/projects`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon"),
            error: `HTTP ${res.status}`,
          };
        }
        const data = await res.json();
        const projects = (data.projects || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          regionId: p.region_id,
          pgVersion: p.pg_version,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        }));

        let summary = `🐘 **Projetos Neon Postgres (${projects.length} encontrados)**:\n\n`;
        if (projects.length === 0) {
          summary += "Nenhum projeto encontrado nesta conta Neon.";
        } else {
          projects.slice(0, 10).forEach((p: any, idx: number) => {
            summary += `${idx + 1}. **${p.name}** (ID: \`${p.id}\`)\n   - Região: \`${p.regionId}\` | Postgres: v${p.pgVersion}\n`;
          });
        }

        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary,
          data: projects,
        };
      }

      case "get_project": {
        const projectId = String(ctx.params.project_id || ctx.params.projectId || ctx.params.id || "").trim();
        if (!projectId) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `project_id` do projeto Neon.",
            error: "project_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/projects/${projectId}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const p = data.project || data;
        const summary =
          `🐘 **Detalhes do Projeto Neon: ${p.name}**\n\n` +
          `- **ID**: \`${p.id}\`\n` +
          `- **Região**: \`${p.region_id}\`\n` +
          `- **Versão Postgres**: ${p.pg_version}\n` +
          `- **Criado em**: ${p.created_at}\n` +
          `- **Histórico de quota**: ${p.history_retention_seconds ? `${p.history_retention_seconds / 3600}h` : "Padrão"}`;

        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary,
          data: p,
        };
      }

      case "list_branches": {
        const projectId = String(ctx.params.project_id || ctx.params.projectId || ctx.params.id || "").trim();
        if (!projectId) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `project_id` para listar as branches.",
            error: "project_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/projects/${projectId}/branches`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const branches = (data.branches || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          primary: Boolean(b.primary),
          state: b.current_state,
          logicalSize: b.logical_size ? `${(b.logical_size / (1024 * 1024)).toFixed(2)} MB` : "N/D",
          createdAt: b.created_at,
        }));

        let summary = `🌿 **Branches do Projeto Neon (\`${projectId}\` - ${branches.length} encontradas)**:\n\n`;
        branches.forEach((b: any) => {
          const badge = b.primary ? "⭐️ [PRIMARY]" : "🌱";
          summary += `- ${badge} **${b.name}** (\`${b.id}\`): Estado: ${b.state} | Tamanho: ${b.logicalSize}\n`;
        });

        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary,
          data: branches,
        };
      }

      case "create_branch": {
        const projectId = String(ctx.params.project_id || ctx.params.projectId || "").trim();
        const branchName = String(ctx.params.name || ctx.params.branch || `preview-${Date.now()}`).trim();

        if (!projectId) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `project_id` onde criar a nova branch.",
            error: "project_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/projects/${projectId}/branches`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            branch: {
              name: branchName,
              parent_id: ctx.params.parent_id || undefined,
            },
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const b = data.branch || data;
        const summary =
          `✅ **Branch criada com sucesso no Neon Postgres!**\n\n` +
          `- **Nome**: \`${b.name}\`\n` +
          `- **ID da Branch**: \`${b.id}\`\n` +
          `- **Projeto**: \`${projectId}\`\n` +
          `- **Estado**: ${b.current_state || "ready"}`;

        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary,
          data: b,
        };
      }

      case "get_connection_uri": {
        const projectId = String(ctx.params.project_id || ctx.params.projectId || "").trim();
        const branchId = String(ctx.params.branch_id || ctx.params.branchId || "").trim();
        const dbName = String(ctx.params.database || "neondb").trim();
        const roleName = String(ctx.params.role || ctx.params.user || "").trim();

        if (!projectId) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `project_id` do Neon.",
            error: "project_id ausente",
          };
        }

        let url = `${BASE_URL}/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(dbName)}`;
        if (branchId) url += `&branch_id=${encodeURIComponent(branchId)}`;
        if (roleName) url += `&role_name=${encodeURIComponent(roleName)}`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `🔗 **URI de Conexão Postgres (Neon)**:\n\n` +
          `\`\`\`text\n${data.uri || data.connection_uri}\n\`\`\`\n` +
          `*(Usa esta string segura na tua aplicação ou no teu ficheiro .env)*`;

        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary,
          data: { uri: data.uri || data.connection_uri },
        };
      }

      case "query":
      case "pg.query":
      case "execute_sql":
      case "sql": {
        const projectId = String(ctx.params.project_id || ctx.params.projectId || ctx.accountName || "").trim();
        const sql = String(ctx.params.query || ctx.params.sql || "").trim();
        const database = String(ctx.params.database || "neondb").trim();

        if (!sql) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica a instrução SQL no parâmetro `query` ou `sql`.",
            error: "query ausente",
          };
        }

        if (!projectId) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `project_id` do Neon.",
            error: "project_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/projects/${projectId}/sql`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: sql, database }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "neon",
            action: ctx.action,
            summary: await handleHttpError(res, "Neon SQL"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        return {
          success: true,
          connector: "neon",
          action: ctx.action,
          summary: `🐘 **Consulta SQL executada no Neon Postgres (\`${database}\`):**\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 3000)}\n\`\`\``,
          data,
        };
      }

      default: {
        return {
          success: false,
          connector: "neon",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Neon Postgres.**\nAções disponíveis: pg.query, list_projects, get_project, list_branches, create_branch, get_connection_uri.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      connector: "neon",
      action: ctx.action,
      summary: `❌ **Falha de rede ao contactar o Neon**: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 2. UPSTASH REDIS CONNECTOR (Serverless Redis REST)
// ============================================================================

export async function executeUpstash(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  let endpoint = ctx.customEndpoint?.trim() || "";

  if (!endpoint && (token.startsWith("http://") || token.startsWith("https://"))) {
    try {
      const parsed = new URL(token);
      endpoint = `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Ignora erro
    }
  }

  if (!token) {
    return {
      success: false,
      connector: "upstash",
      action: ctx.action,
      summary:
        "⚠️ **Upstash Redis Não Conectado**: Adiciona o teu REST Token em Definições → Plugins → Upstash.",
      error: "Credencial ausente",
    };
  }

  if (!endpoint) {
    return {
      success: false,
      connector: "upstash",
      action: ctx.action,
      summary:
        "⚠️ **Endpoint Upstash Ausente**: Em Definições → Plugins → Upstash, define o teu `UPSTASH_REDIS_REST_URL` " +
        "(ex: `https://rapid-fox-12345.upstash.io`) no campo de Endpoint Customizado.",
      error: "Endpoint ausente",
    };
  }

  const BASE_URL = endpoint.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "ping": {
        const res = await fetch(`${BASE_URL}/ping`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }
        const data = await res.json();
        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary: `⚡ **Upstash Redis Respondeu**: \`${data.result || "PONG"}\` (Conexão ativa e funcional).`,
          data,
        };
      }

      case "get": {
        const key = String(ctx.params.key || "").trim();
        if (!key) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica a `key` a consultar.",
            error: "key ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/get/${encodeURIComponent(key)}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const value = data.result;
        const summary =
          value === null
            ? `ℹ️ **Chave Redis \`${key}\`**: Chave não existe ou está expirada (retorno \`null\`).`
            : `🔑 **Chave Redis \`${key}\`**:\n\`\`\`json\n${typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}\n\`\`\``;

        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary,
          data: { key, value },
        };
      }

      case "set": {
        const key = String(ctx.params.key || "").trim();
        const value = ctx.params.value !== undefined ? String(ctx.params.value) : "";
        const ex = ctx.params.ex ? Number(ctx.params.ex) : undefined;

        if (!key) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica a `key` e o `value` para gravar.",
            error: "key ausente",
          };
        }

        let url = `${BASE_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
        if (ex && !isNaN(ex)) {
          url = `${BASE_URL}/setex/${encodeURIComponent(key)}/${ex}/${encodeURIComponent(value)}`;
        }

        const res = await fetch(url, { method: "POST", headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `✅ **Chave Redis definida com sucesso!**\n\n` +
          `- **Chave**: \`${key}\`\n` +
          `- **Valor**: \`${value.slice(0, 80)}${value.length > 80 ? "..." : ""}\`\n` +
          (ex ? `- **Expiração (TTL)**: ${ex} segundos\n` : "") +
          `- **Status**: \`${data.result || "OK"}\``;

        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "del": {
        const key = String(ctx.params.key || "").trim();
        if (!key) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica a `key` a remover.",
            error: "key ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/del/${encodeURIComponent(key)}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const count = data.result || 0;
        const summary =
          count > 0
            ? `🗑️ **Chave Redis \`${key}\` removida com sucesso** (${count} chave deletada).`
            : `ℹ️ **Chave Redis \`${key}\`**: Nenhuma chave correspondente encontrada para apagar.`;

        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "keys": {
        const pattern = String(ctx.params.pattern || "*").trim();
        const res = await fetch(`${BASE_URL}/keys/${encodeURIComponent(pattern)}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const keysList = Array.isArray(data.result) ? data.result : [];
        let summary = `🔑 **Chaves Upstash Redis (Padrão: \`${pattern}\` - ${keysList.length} encontradas)**:\n\n`;
        if (keysList.length === 0) {
          summary += "Nenhuma chave encontrada.";
        } else {
          keysList.slice(0, 25).forEach((k: string, idx: number) => {
            summary += `${idx + 1}. \`${k}\`\n`;
          });
          if (keysList.length > 25) {
            summary += `\n*...e mais ${keysList.length - 25} chaves.*`;
          }
        }

        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary,
          data: keysList,
        };
      }

      case "stats":
      case "info": {
        const res = await fetch(`${BASE_URL}/info`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const infoText = String(data.result || "");
        const summary =
          `📊 **Métricas Upstash Redis**:\n\n` +
          `\`\`\`text\n${infoText.slice(0, 600)}\n\`\`\``;

        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary,
          data: { info: infoText },
        };
      }

      case "command":
      case "exec":
      case "execute":
      case "raw": {
        const rawCommand = (ctx.params.command || ctx.params.cmd || ctx.action).toString().trim();
        const args = Array.isArray(ctx.params.args)
          ? ctx.params.args
          : [ctx.params.key, ctx.params.value, ...(Array.isArray(ctx.params.extra) ? ctx.params.extra : [])].filter((x) => x !== undefined && x !== "");

        const commandArray = [rawCommand, ...args];
        const res = await fetch(`${BASE_URL}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(commandArray),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "upstash",
            action: ctx.action,
            summary: await handleHttpError(res, "Upstash Redis Command"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        return {
          success: true,
          connector: "upstash",
          action: ctx.action,
          summary: `⚡ **Comando Redis \`${rawCommand}\` executado com sucesso!**\n\`\`\`json\n${JSON.stringify(data.result !== undefined ? data.result : data, null, 2)}\n\`\`\``,
          data,
        };
      }

      default: {
        return {
          success: false,
          connector: "upstash",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Upstash Redis.**\nAções disponíveis: ping, get, set, del, keys, stats/info, command/exec.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      connector: "upstash",
      action: ctx.action,
      summary: `❌ **Falha de conexão com Upstash**: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 3. MONGODB ATLAS CONNECTOR (Atlas Data API)
// ============================================================================

export async function executeMongoDb(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "mongodb",
      action: ctx.action,
      summary:
        "⚠️ **MongoDB Atlas Não Conectado**: Adiciona a tua chave Data API em Definições → Plugins → MongoDB Atlas.",
      error: "Credencial ausente",
    };
  }

  let endpoint = ctx.customEndpoint?.trim() || "";
  if (!endpoint) {
    return {
      success: false,
      connector: "mongodb",
      action: ctx.action,
      summary:
        "⚠️ **Endpoint Data API Ausente**: Para conectar ao MongoDB Atlas via REST, adiciona o teu " +
        "URL do Data API App (ex: `https://data.mongodb-api.com/app/<App-ID>/endpoint/data/v1`) no campo de Endpoint Customizado em Definições → Plugins → MongoDB Atlas.",
      error: "customEndpoint ausente",
    };
  }

  const BASE_URL = endpoint.replace(/\/$/, "");
  const headers = {
    "api-key": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const dataSource = String(ctx.params.dataSource || ctx.params.cluster || "Cluster0").trim();
  const database = String(ctx.params.database || ctx.params.db || ctx.accountName || "").trim();
  const collection = String(ctx.params.collection || ctx.params.table || "").trim();

  try {
    switch (ctx.action) {
      case "find": {
        if (!database || !collection) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `database` e `collection` para consultar documentos.",
            error: "database/collection ausente",
          };
        }

        const filter = typeof ctx.params.filter === "object" ? ctx.params.filter : {};
        const limit = typeof ctx.params.limit === "number" ? ctx.params.limit : 10;

        const res = await fetch(`${BASE_URL}/action/find`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            dataSource,
            database,
            collection,
            filter,
            limit,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: await handleHttpError(res, "MongoDB Atlas"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const docs = data.documents || [];
        let summary = `🍃 **MongoDB Atlas: \`${database}.${collection}\` (${docs.length} documentos)**:\n\n`;
        if (docs.length === 0) {
          summary += "Nenhum documento encontrado com o filtro fornecido.";
        } else {
          summary += `\`\`\`json\n${JSON.stringify(docs.slice(0, 5), null, 2)}\n\`\`\``;
        }

        return {
          success: true,
          connector: "mongodb",
          action: ctx.action,
          summary,
          data: docs,
        };
      }

      case "find_one": {
        if (!database || !collection) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `database` e `collection`.",
            error: "database/collection ausente",
          };
        }

        const filter = typeof ctx.params.filter === "object" ? ctx.params.filter : {};
        const res = await fetch(`${BASE_URL}/action/findOne`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            dataSource,
            database,
            collection,
            filter,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: await handleHttpError(res, "MongoDB Atlas"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const doc = data.document;
        const summary = doc
          ? `🍃 **Documento MongoDB (\`${database}.${collection}\`)**:\n\`\`\`json\n${JSON.stringify(doc, null, 2)}\n\`\`\``
          : `ℹ️ Nenhum documento correspondente encontrado em \`${database}.${collection}\`.`;

        return {
          success: true,
          connector: "mongodb",
          action: ctx.action,
          summary,
          data: doc,
        };
      }

      case "insert_one": {
        if (!database || !collection) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `database` e `collection`.",
            error: "database/collection ausente",
          };
        }

        const document = typeof ctx.params.document === "object" ? ctx.params.document : ctx.params;
        const res = await fetch(`${BASE_URL}/action/insertOne`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            dataSource,
            database,
            collection,
            document,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "mongodb",
            action: ctx.action,
            summary: await handleHttpError(res, "MongoDB Atlas"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `✅ **Documento inserido no MongoDB Atlas!**\n\n` +
          `- **Coleção**: \`${database}.${collection}\`\n` +
          `- **InsertedId**: \`${data.insertedId || "OK"}\``;

        return {
          success: true,
          connector: "mongodb",
          action: ctx.action,
          summary,
          data,
        };
      }

      default: {
        if (ctx.action === "ping" || ctx.action === "status" || ctx.action === "health" || ctx.action === "info") {
          return {
            success: true,
            connector: "mongodb",
            action: ctx.action,
            summary: `🍃 **Conexão MongoDB Atlas Configurada** (Cluster: \`${dataSource}\`). Ações disponíveis: \`find\`, \`find_one\`, \`insert_one\`.`,
          };
        }
        return {
          success: false,
          connector: "mongodb",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector MongoDB Atlas.**\nAções disponíveis: find, find_one, insert_one.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      connector: "mongodb",
      action: ctx.action,
      summary: `❌ **Falha de rede ao contactar MongoDB Atlas**: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 4. CLOUDFLARE CONNECTOR (API v4: D1 SQL, Workers, DNS, Pages)
// ============================================================================

export async function executeCloudflare(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "cloudflare",
      action: ctx.action,
      summary:
        "⚠️ **Cloudflare Não Conectado**: Adiciona o teu API Token em Definições → Plugins → Cloudflare.",
      error: "Credencial ausente",
    };
  }

  const cleanToken = token.replace(/^(Bearer|token)\s+/i, "").trim();
  const BASE_URL = "https://api.cloudflare.com/client/v4";
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const resolveAccountId = async (): Promise<string> => {
    let acc = String(ctx.params.account_id || ctx.accountName || "").trim();
    if (acc) return acc;
    try {
      const accRes = await safeFetch(`${BASE_URL}/accounts`, { headers });
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.result) && accData.result.length > 0) {
          return accData.result[0].id;
        }
      }
    } catch {
      // Ignora erro de lookup
    }
    return "";
  };

  try {
    const act = (ctx.action || "verify_token").toLowerCase();

    switch (act) {
      case "verify_token": {
        const res = await safeFetch(`${BASE_URL}/user/tokens/verify`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const r = data.result || {};
        const summary =
          `☁️ **Token Cloudflare Válido e Ativo!**\n\n` +
          `- **Status**: \`${r.status || "active"}\`\n` +
          `- **ID do Token**: \`${r.id || "N/D"}\`\n` +
          (r.expires_on ? `- **Expira em**: ${r.expires_on}\n` : "") +
          `A tua conta Cloudflare está conectada com sucesso ao GRIOT.`;

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: r,
        };
      }

      case "list_zones":
      case "zones.list":
      case "zones": {
        const res = await safeFetch(`${BASE_URL}/zones`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const zones = (data.result || []).map((z: any) => ({
          id: z.id,
          name: z.name,
          status: z.status,
          plan: z.plan?.name,
          nameServers: z.name_servers,
        }));

        let summary = `🌐 **Zonas DNS Cloudflare (${zones.length} encontradas)**:\n\n`;
        if (zones.length === 0) {
          summary += "Nenhuma zona DNS ativa nesta conta.";
        } else {
          zones.slice(0, 10).forEach((z: any, idx: number) => {
            summary += `${idx + 1}. **${z.name}** (\`${z.id}\`): Status: \`${z.status}\` | Plano: ${z.plan || "Free"}\n`;
          });
        }

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: zones,
        };
      }

      case "list_pages":
      case "pages.list_projects":
      case "pages.projects":
      case "pages.list":
      case "pages":
      case "list_projects":
      case "projects.list":
      case "projects": {
        const accountId = await resolveAccountId();
        if (!accountId) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary:
              "⚠️ **Account ID Ausente**: Especifica `account_id` ou insere o ID da tua conta Cloudflare " +
              "em Definições → Plugins → Cloudflare.",
            error: "account_id ausente",
          };
        }

        const res = await safeFetch(`${BASE_URL}/accounts/${accountId}/pages/projects`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare Pages"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const projects = (data.result || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          subdomain: p.subdomain,
          productionBranch: p.production_branch,
          createdOn: p.created_on,
          canonicalDeployment: p.canonical_deployment?.url,
        }));

        let summary = `📄 **Cloudflare Pages (${projects.length} projetos)**:\n\n`;
        if (projects.length === 0) {
          summary += "Nenhum projeto Pages encontrado nesta conta.";
        } else {
          projects.forEach((p: any, idx: number) => {
            summary += `${idx + 1}. **${p.name}** (\`${p.subdomain || p.name}.pages.dev\`)\n` +
              `   Branch: \`${p.productionBranch || "main"}\` | Criado: ${p.createdOn ? new Date(p.createdOn).toLocaleDateString("pt-PT") : "N/D"}\n`;
          });
        }

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: projects,
        };
      }

      case "list_d1":
      case "list_d1_databases":
      case "d1.list":
      case "d1": {
        const accountId = await resolveAccountId();
        if (!accountId) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary:
              "⚠️ **Account ID Ausente**: Especifica `account_id` ou insere o ID da tua conta Cloudflare " +
              "no campo de Conta em Definições → Plugins → Cloudflare.",
            error: "account_id ausente",
          };
        }

        const res = await safeFetch(`${BASE_URL}/accounts/${accountId}/d1/database`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare D1"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const dbs = (data.result || []).map((db: any) => ({
          uuid: db.uuid,
          name: db.name,
          numTables: db.num_tables,
          fileSize: db.file_size ? `${(db.file_size / (1024 * 1024)).toFixed(2)} MB` : "N/D",
          createdAt: db.created_at,
        }));

        let summary = `🗄️ **Bases de Dados D1 Serverless (${dbs.length} encontradas)**:\n\n`;
        if (dbs.length === 0) {
          summary += "Nenhuma base D1 encontrada nesta conta.";
        } else {
          dbs.forEach((db: any, idx: number) => {
            summary += `${idx + 1}. **${db.name}** (\`${db.uuid}\`): ${db.numTables || 0} tabelas | Tamanho: ${db.fileSize}\n`;
          });
        }

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: dbs,
        };
      }

      case "query_d1":
      case "d1.query":
      case "d1_query":
      case "query": {
        const accountId = await resolveAccountId();
        const dbId = String(ctx.params.database_id || ctx.params.database || "").trim();
        const sql = String(ctx.params.sql || ctx.params.query || "").trim();

        if (!accountId || !dbId || !sql) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `account_id`, `database_id` e a instrução `sql`.",
            error: "Parâmetros D1 ausentes",
          };
        }

        const res = await safeFetch(`${BASE_URL}/accounts/${accountId}/d1/database/${dbId}/query`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sql,
            params: ctx.params.query_params || [],
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare D1"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const resultItem = (data.result && data.result[0]) || {};
        const rows = resultItem.results || [];
        const summary =
          `⚡ **Resultado SQL D1 (Cloudflare)**:\n\n` +
          `- **Linhas Retornadas**: ${rows.length}\n` +
          `- **Tempo de Execução**: ${resultItem.meta?.duration?.toFixed(2) || "N/D"} ms\n\n` +
          `\`\`\`json\n${JSON.stringify(rows.slice(0, 10), null, 2)}\n\`\`\``;

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: rows,
        };
      }

      case "list_workers":
      case "workers.list":
      case "workers": {
        const accountId = await resolveAccountId();
        if (!accountId) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: "⚠️ **Account ID Ausente**: Especifica `account_id` para listar Cloudflare Workers.",
            error: "account_id ausente",
          };
        }

        const res = await safeFetch(`${BASE_URL}/accounts/${accountId}/workers/scripts`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "cloudflare",
            action: ctx.action,
            summary: await handleHttpError(res, "Cloudflare Workers"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const workers = (data.result || []).map((w: any) => ({
          id: w.id,
          createdOn: w.created_on,
          modifiedOn: w.modified_on,
          usageModel: w.usage_model,
        }));

        let summary = `🚀 **Cloudflare Workers (${workers.length} scripts)**:\n\n`;
        if (workers.length === 0) {
          summary += "Nenhum script Worker encontrado nesta conta.";
        } else {
          workers.forEach((w: any, idx: number) => {
            summary += `${idx + 1}. **${w.id}** (Modificado em: ${w.modifiedOn || "N/D"})\n`;
          });
        }

        return {
          success: true,
          connector: "cloudflare",
          action: ctx.action,
          summary,
          data: workers,
        };
      }

      default: {
        return {
          success: false,
          connector: "cloudflare",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Cloudflare.**\nAções disponíveis: pages.list_projects, d1.query, d1.list, workers.list, zones.list, verify_token.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      connector: "cloudflare",
      action: ctx.action,
      summary: `❌ **Falha de rede ao contactar Cloudflare**: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 5. QDRANT CONNECTOR (Vector Database REST API)
// ============================================================================

export async function executeQdrant(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  let endpoint = ctx.customEndpoint?.trim() || "";

  if (!endpoint) {
    endpoint = "http://localhost:6333";
  }

  const BASE_URL = endpoint.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["api-key"] = token;
  }

  try {
    switch (ctx.action) {
      case "list_collections":
      case "collections.list": {
        const res = await fetch(`${BASE_URL}/collections`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "qdrant",
            action: ctx.action,
            summary: await handleHttpError(res, "Qdrant"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const collections = (data.result?.collections || []).map((c: any) => ({
          name: c.name,
        }));

        let summary = `🧠 **Coleções Vetoriais Qdrant (${collections.length} encontradas)**:\n\n`;
        if (collections.length === 0) {
          summary += "Nenhuma coleção vetorial criada ainda no cluster Qdrant.";
        } else {
          collections.forEach((c: any, idx: number) => {
            summary += `${idx + 1}. **${c.name}**\n`;
          });
        }

        return {
          success: true,
          connector: "qdrant",
          action: ctx.action,
          summary,
          data: collections,
        };
      }

      case "get_collection":
      case "collections.get": {
        const name = String(ctx.params.collection || ctx.params.name || "").trim();
        if (!name) {
          return {
            success: false,
            connector: "qdrant",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o nome da `collection` vetorial.",
            error: "collection ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/collections/${encodeURIComponent(name)}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "qdrant",
            action: ctx.action,
            summary: await handleHttpError(res, "Qdrant"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const r = data.result || {};
        const summary =
          `🧠 **Detalhes da Coleção Vetorial: ${name}**\n\n` +
          `- **Status**: \`${r.status || "green"}\`\n` +
          `- **Vetores Indexados**: ${r.vectors_count ?? r.points_count ?? 0}\n` +
          `- **Segmentos**: ${r.segments_count || 1}\n` +
          `- **Métrica de Distância**: \`${r.config?.params?.vectors?.distance || "Cosine"}\`\n` +
          `- **Dimensão Vetorial**: ${r.config?.params?.vectors?.size || "N/D"}`;

        return {
          success: true,
          connector: "qdrant",
          action: ctx.action,
          summary,
          data: r,
        };
      }

      case "search":
      case "vector.search":
      case "vector.query":
      case "query": {
        const name = String(ctx.params.collection || "").trim();
        const vector = ctx.params.vector;

        if (!name || !vector || !Array.isArray(vector)) {
          return {
            success: false,
            connector: "qdrant",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica a `collection` e o array `vector` de números para busca semântica.",
            error: "collection/vector inválido",
          };
        }

        const limit = typeof ctx.params.limit === "number" ? ctx.params.limit : 5;
        const res = await fetch(`${BASE_URL}/collections/${encodeURIComponent(name)}/points/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            vector,
            limit,
            with_payload: true,
            with_vector: false,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "qdrant",
            action: ctx.action,
            summary: await handleHttpError(res, "Qdrant"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const points = data.result || [];
        const summary =
          `🔍 **Resultados de Busca Vetorial Qdrant (${points.length} pontos mais similares)**:\n\n` +
          `\`\`\`json\n${JSON.stringify(points, null, 2)}\n\`\`\``;

        return {
          success: true,
          connector: "qdrant",
          action: ctx.action,
          summary,
          data: points,
        };
      }

      case "cluster_info":
      case "telemetry":
      case "ping":
      case "status": {
        const res = await fetch(`${BASE_URL}/telemetry`, { headers }).catch(() => null);
        let version = "Qdrant";
        if (res && res.ok) {
          const t = await res.json();
          version = t.result?.app?.version ? `v${t.result.app.version}` : version;
        }

        return {
          success: true,
          connector: "qdrant",
          action: ctx.action,
          summary: `🧠 **Qdrant Vector Engine Conectado** (${version} em \`${BASE_URL}\`). Ações: \`list_collections\`, \`get_collection\`, \`search\`.`,
        };
      }

      default: {
        return {
          success: false,
          connector: "qdrant",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Qdrant.**\nAções disponíveis: vector.search, collections.list, collections.get, cluster_info.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      connector: "qdrant",
      action: ctx.action,
      summary: `❌ **Falha de rede ao contactar Qdrant**: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// DISPACHADOR DO LOTE 2
// ============================================================================

export async function executeBatch2Connector(
  connectorName: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const norm = connectorName.toLowerCase().trim();

  switch (norm) {
    case "neon":
    case "neon_postgres":
    case "neonpostgres":
      return executeNeon(ctx);

    case "upstash":
    case "upstash_redis":
    case "redis":
      return executeUpstash(ctx);

    case "mongodb":
    case "mongo":
    case "mongodb_atlas":
      return executeMongoDb(ctx);

    case "cloudflare":
    case "cf":
    case "d1":
      return executeCloudflare(ctx);

    case "qdrant":
    case "qdrant_vector":
      return executeQdrant(ctx);

    default:
      return {
        success: false,
        connector: connectorName,
        action: ctx.action,
        summary:
          `⚠️ O conector **${connectorName}** pertence aos próximos lotes. ` +
          `Conectores ativos no Lote 2: **Neon Postgres**, **Upstash Redis**, **MongoDB Atlas**, **Cloudflare** e **Qdrant**.`,
        error: "Conector não suportado no Lote 2",
      };
  }
}
