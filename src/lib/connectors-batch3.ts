/* eslint-disable max-lines */
/**
 * GRIOT Mobile Connector Engine - Lote 3: Produtividade, Gestão, Comunicação & Telemetria
 * 
 * Implementação completa de produção para:
 * 1. Linear (Gestão ágil, GraphQL API: issues, projetos, equipas, criação)
 * 2. Notion (Wikis e bases de conhecimento: busca, páginas, bancos de dados, criação)
 * 3. Slack (Comunicação e alertas: Webhooks, chat.postMessage, canais, auth.test)
 * 4. Trello (Quadros Kanban: quadros, listas, cartões, criação)
 * 5. Sentry (Telemetria e erros: projetos, falhas não resolvidas, detalhes, resolução)
 */

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

/**
 * Tratamento universal de erros HTTP com orientações em português.
 */
async function handleHttpError(res: Response, serviceName: string): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail =
        json.message ||
        json.error?.message ||
        json.error ||
        json.description ||
        JSON.stringify(json);
    } catch {
      detail = text.slice(0, 300);
    }
  } catch {
    detail = res.statusText;
  }

  switch (res.status) {
    case 401:
      return (
        `🔐 **Autenticação falhou em ${serviceName}** (HTTP 401):\n` +
        `A chave de API ou token fornecido é inválido ou expirou.\n` +
        `➡️ Vai a **Definições → Plugins → ${serviceName}** e atualiza a tua credencial.\n` +
        (detail ? `Detalhe retornado: ${detail}` : "")
      );
    case 403:
      return (
        `🚫 **Acesso negado em ${serviceName}** (HTTP 403):\n` +
        `O token não possui permissões suficientes para esta operação.\n` +
        (detail ? `Detalhe retornado: ${detail}` : "")
      );
    case 404:
      return (
        `🔍 **Recurso não encontrado em ${serviceName}** (HTTP 404):\n` +
        `Verifica se o ID ou nome fornecido existe e está acessível.\n` +
        (detail ? `Detalhe retornado: ${detail}` : "")
      );
    case 429:
      return `⏳ **Limite de requisições excedido em ${serviceName}** (HTTP 429). Tenta novamente em alguns instantes.`;
    default:
      return `⚠️ **Erro ${res.status} em ${serviceName}**: ${detail || res.statusText}`;
  }
}

// ============================================================================
// 1. LINEAR CONNECTOR (GraphQL API)
// ============================================================================

export async function executeLinear(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "linear",
      action: ctx.action,
      summary:
        "⚠️ **Linear Não Conectado**: Adiciona a tua Personal API Key em Definições → Plugins → Linear.",
      error: "Credencial ausente",
    };
  }

  const GRAPHQL_URL = "https://api.linear.app/graphql";
  const headers = {
    Authorization: token.startsWith("lin_api_") ? token : token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const runQuery = async (query: string, variables: Record<string, unknown> = {}) => {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(await handleHttpError(res, "Linear"));
    }
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || "Erro no GraphQL do Linear");
    }
    return json.data;
  };

  try {
    switch (ctx.action) {
      case "get_viewer":
      case "viewer.get":
      case "profile":
      case "me":
      case "user": {
        const data = await runQuery(`
          query {
            viewer {
              id
              name
              email
              admin
            }
          }
        `);
        const v = data.viewer || {};
        const summary =
          `📐 **Conta Linear Conectada**:\n\n` +
          `- **Nome**: ${v.name || "N/D"}\n` +
          `- **Email**: ${v.email || "N/D"}\n` +
          `- **ID**: \`${v.id}\`\n` +
          `- **Administrador**: ${v.admin ? "Sim" : "Não"}`;

        return {
          success: true,
          connector: "linear",
          action: ctx.action,
          summary,
          data: v,
        };
      }

      case "list_issues":
      case "issues.list":
      case "issues": {
        const limit = typeof ctx.params.limit === "number" ? ctx.params.limit : 15;
        const data = await runQuery(`
          query ListIssues($first: Int!) {
            issues(first: $first, orderBy: updatedAt) {
              nodes {
                id
                identifier
                title
                priority
                priorityLabel
                state {
                  name
                  type
                }
                assignee {
                  name
                }
                updatedAt
              }
            }
          }
        `, { first: limit });

        const issues = (data.issues?.nodes || []).map((i: any) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          priority: i.priorityLabel || `P${i.priority}`,
          state: i.state?.name || "Sem estado",
          assignee: i.assignee?.name || "Não atribuído",
          updatedAt: i.updatedAt,
        }));

        let summary = `📐 **Issues do Linear (${issues.length} encontradas)**:\n\n`;
        if (issues.length === 0) {
          summary += "Nenhuma issue encontrada no Linear.";
        } else {
          issues.forEach((i: any, idx: number) => {
            summary += `${idx + 1}. **[${i.identifier}] ${i.title}**\n   - Estado: \`${i.state}\` | Prioridade: ${i.priority} | Responsável: ${i.assignee}\n`;
          });
        }

        return {
          success: true,
          connector: "linear",
          action: ctx.action,
          summary,
          data: issues,
        };
      }

      case "create_issue":
      case "issues.create": {
        const title = String(ctx.params.title || "").trim();
        const description = String(ctx.params.description || ctx.params.body || "").trim();
        let teamId = String(ctx.params.team_id || ctx.params.teamId || "").trim();

        if (!title) {
          return {
            success: false,
            connector: "linear",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `title` da nova issue no Linear.",
            error: "title ausente",
          };
        }

        // Se não forneceu teamId, buscar a primeira equipa da organização
        if (!teamId) {
          const teamsData = await runQuery(`
            query {
              teams(first: 1) {
                nodes {
                  id
                  name
                  key
                }
              }
            }
          `);
          const firstTeam = teamsData.teams?.nodes?.[0];
          if (!firstTeam) {
            return {
              success: false,
              connector: "linear",
              action: ctx.action,
              summary: "⚠️ Nenhuma equipa encontrada no Linear para associar a nova issue.",
              error: "teamId ausente",
            };
          }
          teamId = firstTeam.id;
        }

        const data = await runQuery(`
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                title
                url
                state {
                  name
                }
              }
            }
          }
        `, {
          input: {
            title,
            description: description || undefined,
            teamId,
          },
        });

        const issue = data.issueCreate?.issue;
        const summary =
          `✅ **Issue criada com sucesso no Linear!**\n\n` +
          `- **Identificador**: **${issue?.identifier}**\n` +
          `- **Título**: ${issue?.title}\n` +
          `- **Estado**: \`${issue?.state?.name || "Backlog"}\`\n` +
          `- **Link**: [${issue?.url}](${issue?.url})`;

        return {
          success: true,
          connector: "linear",
          action: ctx.action,
          summary,
          data: issue,
        };
      }

      case "list_teams":
      case "teams.list":
      case "teams": {
        const data = await runQuery(`
          query {
            teams(first: 10) {
              nodes {
                id
                name
                key
                description
              }
            }
          }
        `);
        const teams = data.teams?.nodes || [];
        let summary = `📐 **Equipas do Linear (${teams.length} encontradas)**:\n\n`;
        teams.forEach((t: any, idx: number) => {
          summary += `${idx + 1}. **${t.name}** (Chave: \`${t.key}\` | ID: \`${t.id}\`)\n`;
        });

        return {
          success: true,
          connector: "linear",
          action: ctx.action,
          summary,
          data: teams,
        };
      }

      case "list_projects":
      case "projects.list":
      case "projects": {
        const data = await runQuery(`
          query {
            projects(first: 10) {
              nodes {
                id
                name
                state
                progress
                targetDate
              }
            }
          }
        `);
        const projects = data.projects?.nodes || [];
        let summary = `📐 **Projetos do Linear (${projects.length} encontrados)**:\n\n`;
        if (projects.length === 0) {
          summary += "Nenhum projeto encontrado.";
        } else {
          projects.forEach((p: any, idx: number) => {
            const prog = Math.round((p.progress || 0) * 100);
            summary += `${idx + 1}. **${p.name}**: Estado: \`${p.state}\` | Progresso: ${prog}%\n`;
          });
        }

        return {
          success: true,
          connector: "linear",
          action: ctx.action,
          summary,
          data: projects,
        };
      }

      default:
        return {
          success: false,
          connector: "linear",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Linear.**\nAções disponíveis: issues.list, issues.create, teams.list, projects.list, viewer.get.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "linear",
      action: ctx.action,
      summary: `❌ **Falha ao comunicar com o Linear**: ${err.message || String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 2. NOTION CONNECTOR (REST API v1)
// ============================================================================

export async function executeNotion(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "notion",
      action: ctx.action,
      summary:
        "⚠️ **Notion Não Conectado**: Adiciona a tua Internal Integration Secret (ex: `secret_...`) em Definições → Plugins → Notion.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://api.notion.com/v1";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "search":
      case "notion.search": {
        const query = String(ctx.params.query || ctx.params.text || "").trim();
        const res = await fetch(`${BASE_URL}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: query || undefined,
            page_size: typeof ctx.params.limit === "number" ? ctx.params.limit : 10,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: await handleHttpError(res, "Notion"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const results = (data.results || []).map((item: any) => {
          let title = "Sem título";
          if (item.object === "page") {
            const titleProp = Object.values(item.properties || {}).find(
              (p: any) => p.type === "title"
            ) as any;
            if (titleProp?.title?.[0]?.plain_text) {
              title = titleProp.title[0].plain_text;
            }
          } else if (item.object === "database") {
            title = item.title?.[0]?.plain_text || "Base de Dados";
          }

          return {
            id: item.id,
            object: item.object,
            title,
            url: item.url,
            lastEditedTime: item.last_edited_time,
          };
        });

        let summary = `📝 **Resultados de Pesquisa no Notion (${results.length} itens encontrados)**:\n\n`;
        if (results.length === 0) {
          summary += "Nenhum documento ou página acessível encontrado no Notion.";
        } else {
          results.forEach((r: any, idx: number) => {
            const icon = r.object === "database" ? "🗃️" : "📄";
            summary += `${idx + 1}. ${icon} **${r.title}** (ID: \`${r.id}\`)\n   - Tipo: ${r.object} | Link: [${r.url}](${r.url})\n`;
          });
        }

        return {
          success: true,
          connector: "notion",
          action: ctx.action,
          summary,
          data: results,
        };
      }

      case "get_page":
      case "pages.get":
      case "page.get": {
        const pageId = String(ctx.params.page_id || ctx.params.pageId || ctx.params.id || "").trim();
        if (!pageId) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `page_id` da página Notion.",
            error: "page_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/pages/${encodeURIComponent(pageId)}`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: await handleHttpError(res, "Notion"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        let title = "Sem título";
        const titleProp = Object.values(data.properties || {}).find(
          (p: any) => p.type === "title"
        ) as any;
        if (titleProp?.title?.[0]?.plain_text) {
          title = titleProp.title[0].plain_text;
        }

        const summary =
          `📄 **Página Notion: ${title}**\n\n` +
          `- **ID**: \`${data.id}\`\n` +
          `- **Criada em**: ${data.created_time}\n` +
          `- **Última edição**: ${data.last_edited_time}\n` +
          `- **Link**: [${data.url}](${data.url})`;

        return {
          success: true,
          connector: "notion",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "query_database":
      case "databases.query":
      case "database.query": {
        const databaseId = String(ctx.params.database_id || ctx.params.databaseId || ctx.params.id || "").trim();
        if (!databaseId) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `database_id` do banco de dados Notion.",
            error: "database_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/databases/${encodeURIComponent(databaseId)}/query`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            page_size: typeof ctx.params.limit === "number" ? ctx.params.limit : 10,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: await handleHttpError(res, "Notion"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const rows = (data.results || []).map((row: any) => {
          let rowTitle = "Item";
          const titleProp = Object.values(row.properties || {}).find((p: any) => p.type === "title") as any;
          if (titleProp?.title?.[0]?.plain_text) {
            rowTitle = titleProp.title[0].plain_text;
          }
          return {
            id: row.id,
            title: rowTitle,
            url: row.url,
          };
        });

        let summary = `🗃️ **Registos da Base de Dados Notion (${rows.length} itens)**:\n\n`;
        rows.forEach((r: any, idx: number) => {
          summary += `${idx + 1}. **${r.title}** (\`${r.id}\`)\n`;
        });

        return {
          success: true,
          connector: "notion",
          action: ctx.action,
          summary,
          data: rows,
        };
      }

      case "create_page":
      case "pages.create":
      case "page.create": {
        const title = String(ctx.params.title || "Nova Página GRIOT").trim();
        const parentId = String(ctx.params.parent_id || ctx.params.parentId || ctx.params.database_id || "").trim();
        const isDatabase = Boolean(ctx.params.is_database || ctx.params.database_id);

        if (!parentId) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica `parent_id` (ID da página-mãe ou do banco de dados).",
            error: "parent_id ausente",
          };
        }

        const parent = isDatabase
          ? { database_id: parentId }
          : { page_id: parentId };

        const res = await fetch(`${BASE_URL}/pages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            parent,
            properties: {
              title: [
                {
                  text: {
                    content: title,
                  },
                },
              ],
            },
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "notion",
            action: ctx.action,
            summary: await handleHttpError(res, "Notion"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `✅ **Página criada com sucesso no Notion!**\n\n` +
          `- **Título**: ${title}\n` +
          `- **ID**: \`${data.id}\`\n` +
          `- **Link**: [${data.url}](${data.url})`;

        return {
          success: true,
          connector: "notion",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "notion",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Notion.**\nAções disponíveis: search, pages.get, databases.query, pages.create.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "notion",
      action: ctx.action,
      summary: `❌ **Falha ao contactar o Notion**: ${err.message || String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 3. SLACK CONNECTOR (Incoming Webhooks & Bot API)
// ============================================================================

export async function executeSlack(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const cred = ctx.credential.trim();
  const endpoint = ctx.customEndpoint?.trim() || "";

  // Suporte a Webhook URL (no campo credential ou customEndpoint)
  const isWebhook = cred.startsWith("https://hooks.slack.com/") || endpoint.startsWith("https://hooks.slack.com/");
  const webhookUrl = isWebhook ? (cred.startsWith("https://") ? cred : endpoint) : "";

  if (!cred && !webhookUrl) {
    return {
      success: false,
      connector: "slack",
      action: ctx.action,
      summary:
        "⚠️ **Slack Não Conectado**: Adiciona o teu Webhook URL ou Bot Token (`xoxb-...`) em Definições → Plugins → Slack.",
      error: "Credencial ausente",
    };
  }

  try {
    switch (ctx.action) {
      case "send_message":
      case "messages.send":
      case "chat.postMessage":
      case "message.send":
      case "post_message": {
        const text = String(ctx.params.text || ctx.params.message || ctx.params.body || "").trim();
        const channel = String(ctx.params.channel || "").trim();

        if (!text) {
          return {
            success: false,
            connector: "slack",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `text` ou `message` a enviar para o Slack.",
            error: "text ausente",
          };
        }

        if (isWebhook) {
          // Envio via Webhook
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          if (!res.ok) {
            const errorMsg = await res.text();
            return {
              success: false,
              connector: "slack",
              action: ctx.action,
              summary: `⚠️ **Erro ao enviar Webhook Slack**: ${errorMsg}`,
              error: errorMsg,
            };
          }

          return {
            success: true,
            connector: "slack",
            action: ctx.action,
            summary: `💬 **Mensagem enviada com sucesso para o Slack via Webhook!**\n\n> ${text.slice(0, 150)}`,
            data: { status: "ok" },
          };
        } else {
          // Envio via Bot Token
          if (!channel) {
            return {
              success: false,
              connector: "slack",
              action: ctx.action,
              summary: "⚠️ **Parâmetro em falta**: Quando usado Bot Token, especifica o `channel` (ex: `#geral` ou `C123456`).",
              error: "channel ausente",
            };
          }

          const res = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cred}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel,
              text,
            }),
          });

          const data = await res.json();
          if (!data.ok) {
            return {
              success: false,
              connector: "slack",
              action: ctx.action,
              summary: `⚠️ **Erro Slack API**: ${data.error || "Falha ao postar mensagem"}`,
              error: data.error,
            };
          }

          return {
            success: true,
            connector: "slack",
            action: ctx.action,
            summary: `💬 **Mensagem enviada para o Slack no canal #${channel}!**\n\n> ${text.slice(0, 150)}`,
            data,
          };
        }
      }

      case "list_channels":
      case "channels.list":
      case "conversations.list":
      case "channels": {
        if (isWebhook) {
          return {
            success: false,
            connector: "slack",
            action: ctx.action,
            summary: "ℹ️ Webhooks do Slack são vinculados a um canal pré-definido e não suportam listar canais. Usa um Bot Token (xoxb-...) para listar múltiplos canais.",
            error: "Ação não suportada em Webhooks",
          };
        }

        const res = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20", {
          headers: { Authorization: `Bearer ${cred}` },
        });

        const data = await res.json();
        if (!data.ok) {
          return {
            success: false,
            connector: "slack",
            action: ctx.action,
            summary: `⚠️ **Erro Slack API**: ${data.error}`,
            error: data.error,
          };
        }

        const channels = (data.channels || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          numMembers: c.num_members,
        }));

        let summary = `💬 **Canais Slack Encontrados (${channels.length})**:\n\n`;
        channels.forEach((c: any, idx: number) => {
          summary += `${idx + 1}. **#${c.name}** (ID: \`${c.id}\` | ${c.numMembers || 0} membros)\n`;
        });

        return {
          success: true,
          connector: "slack",
          action: ctx.action,
          summary,
          data: channels,
        };
      }

      case "auth_test":
      case "auth.test":
      case "ping":
      case "status": {
        if (isWebhook) {
          return {
            success: true,
            connector: "slack",
            action: ctx.action,
            summary: "💬 **Webhook Slack Ativo**: Configurado e pronto para receber notificações.",
            data: { mode: "webhook" },
          };
        }

        const res = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${cred}` },
        });

        const data = await res.json();
        if (!data.ok) {
          return {
            success: false,
            connector: "slack",
            action: ctx.action,
            summary: `⚠️ **Autenticação Slack Falhou**: ${data.error}`,
            error: data.error,
          };
        }

        const summary =
          `💬 **Conexão Slack Verificada com Sucesso!**\n\n` +
          `- **Espaço de Trabalho**: ${data.team || "N/D"}\n` +
          `- **Utilizador Bot**: ${data.user || "N/D"}\n` +
          `- **URL**: ${data.url || "N/D"}`;

        return {
          success: true,
          connector: "slack",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "slack",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Slack.**\nAções disponíveis: messages.send, channels.list, auth_test.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "slack",
      action: ctx.action,
      summary: `❌ **Falha ao comunicar com Slack**: ${err.message || String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 4. TRELLO CONNECTOR (REST API v1)
// ============================================================================

export async function executeTrello(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const cred = ctx.credential.trim();
  if (!cred) {
    return {
      success: false,
      connector: "trello",
      action: ctx.action,
      summary:
        "⚠️ **Trello Não Conectado**: Adiciona a tua API Key e Token (no formato `key:token` ou preenche o token) em Definições → Plugins → Trello.",
      error: "Credencial ausente",
    };
  }

  // Trello exige key e token
  let key = "";
  let token = "";

  if (cred.includes(":")) {
    const parts = cred.split(":");
    key = parts[0].trim();
    token = parts[1].trim();
  } else {
    // Se veio apenas um token, verificar params
    token = cred;
    key = String(ctx.params.key || ctx.params.apiKey || "").trim();
  }

  if (!key || !token) {
    return {
      success: false,
      connector: "trello",
      action: ctx.action,
      summary:
        "⚠️ **Credenciais Trello Incompletas**: O Trello exige API Key e Token. " +
        "Insere no campo da credencial no formato `SUA_API_KEY:SEU_TOKEN` em Definições → Plugins → Trello.",
      error: "key ou token ausente",
    };
  }

  const BASE_URL = "https://api.trello.com/1";
  const authQuery = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;

  try {
    switch (ctx.action) {
      case "get_member":
      case "members.get":
      case "member.get":
      case "profile":
      case "me": {
        const res = await fetch(`${BASE_URL}/members/me?${authQuery}`);
        if (!res.ok) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: await handleHttpError(res, "Trello"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `📋 **Membro Trello Conectado**:\n\n` +
          `- **Nome**: ${data.fullName || data.username}\n` +
          `- **Username**: @${data.username}\n` +
          `- **ID**: \`${data.id}\`\n` +
          `- **Link do Perfil**: [${data.url}](${data.url})`;

        return {
          success: true,
          connector: "trello",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_boards":
      case "boards.list":
      case "boards": {
        const res = await fetch(`${BASE_URL}/members/me/boards?${authQuery}&filter=open`);
        if (!res.ok) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: await handleHttpError(res, "Trello"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const boards = (data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          url: b.url,
          closed: b.closed,
        }));

        let summary = `📋 **Quadros Trello (${boards.length} encontrados)**:\n\n`;
        if (boards.length === 0) {
          summary += "Nenhum quadro aberto encontrado nesta conta.";
        } else {
          boards.forEach((b: any, idx: number) => {
            summary += `${idx + 1}. **${b.name}** (ID: \`${b.id}\`)\n   Link: [${b.url}](${b.url})\n`;
          });
        }

        return {
          success: true,
          connector: "trello",
          action: ctx.action,
          summary,
          data: boards,
        };
      }

      case "list_lists":
      case "lists.list":
      case "lists": {
        const boardId = String(ctx.params.board_id || ctx.params.boardId || "").trim();
        if (!boardId) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `board_id` do quadro Trello.",
            error: "board_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/boards/${encodeURIComponent(boardId)}/lists?${authQuery}`);
        if (!res.ok) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: await handleHttpError(res, "Trello"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const lists = (data || []).map((l: any) => ({
          id: l.id,
          name: l.name,
        }));

        let summary = `📋 **Colunas/Listas do Quadro (${lists.length} encontradas)**:\n\n`;
        lists.forEach((l: any, idx: number) => {
          summary += `${idx + 1}. **${l.name}** (ID: \`${l.id}\`)\n`;
        });

        return {
          success: true,
          connector: "trello",
          action: ctx.action,
          summary,
          data: lists,
        };
      }

      case "list_cards":
      case "cards.list":
      case "cards": {
        const listId = String(ctx.params.list_id || ctx.params.listId || "").trim();
        if (!listId) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `list_id` da coluna para listar os cartões.",
            error: "list_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/lists/${encodeURIComponent(listId)}/cards?${authQuery}`);
        if (!res.ok) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: await handleHttpError(res, "Trello"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const cards = (data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          desc: c.desc,
          url: c.url,
        }));

        let summary = `📋 **Cartões Trello na Lista (${cards.length} encontrados)**:\n\n`;
        if (cards.length === 0) {
          summary += "Nenhum cartão nesta lista.";
        } else {
          cards.forEach((c: any, idx: number) => {
            summary += `${idx + 1}. **${c.name}**\n   ID: \`${c.id}\` | Link: [${c.url}](${c.url})\n`;
          });
        }

        return {
          success: true,
          connector: "trello",
          action: ctx.action,
          summary,
          data: cards,
        };
      }

      case "create_card":
      case "cards.create": {
        const listId = String(ctx.params.list_id || ctx.params.listId || "").trim();
        const name = String(ctx.params.name || ctx.params.title || "").trim();
        const desc = String(ctx.params.desc || ctx.params.description || "").trim();

        if (!listId || !name) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `list_id` e o `name` (título) do cartão.",
            error: "list_id ou name ausente",
          };
        }

        const url = `${BASE_URL}/cards?${authQuery}&idList=${encodeURIComponent(listId)}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}`;
        const res = await fetch(url, { method: "POST" });
        if (!res.ok) {
          return {
            success: false,
            connector: "trello",
            action: ctx.action,
            summary: await handleHttpError(res, "Trello"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const summary =
          `✅ **Cartão criado com sucesso no Trello!**\n\n` +
          `- **Nome**: ${data.name}\n` +
          `- **ID**: \`${data.id}\`\n` +
          `- **Link**: [${data.url}](${data.url})`;

        return {
          success: true,
          connector: "trello",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "trello",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Trello.**\nAções disponíveis: boards.list, lists.list, cards.list, cards.create, get_member.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "trello",
      action: ctx.action,
      summary: `❌ **Falha ao comunicar com Trello**: ${err.message || String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// 5. SENTRY CONNECTOR (REST API v0)
// ============================================================================

export async function executeSentry(
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      connector: "sentry",
      action: ctx.action,
      summary:
        "⚠️ **Sentry Não Conectado**: Adiciona o teu Auth Token em Definições → Plugins → Sentry.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://sentry.io/api/0";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "list_projects":
      case "projects.list":
      case "projects": {
        const res = await fetch(`${BASE_URL}/projects/`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: await handleHttpError(res, "Sentry"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const projects = (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          platform: p.platform,
          organization: p.organization?.slug,
        }));

        let summary = `🛡️ **Projetos Monitorizados no Sentry (${projects.length} encontrados)**:\n\n`;
        if (projects.length === 0) {
          summary += "Nenhum projeto encontrado nesta conta Sentry.";
        } else {
          projects.forEach((p: any, idx: number) => {
            summary += `${idx + 1}. **${p.name}** (slug: ${p.slug} | Org: ${p.organization}) [Plataforma: ${p.platform || "javascript"}]\n`;
          });
        }

        return {
          success: true,
          connector: "sentry",
          action: ctx.action,
          summary,
          data: projects,
        };
      }

      case "list_issues":
      case "issues.list":
      case "issues": {
        const org = String(ctx.params.organization || ctx.params.org || ctx.accountName || "").trim();
        const project = String(ctx.params.project || ctx.params.project_slug || "").trim();

        if (!org || !project) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica a `organization` e o `project` do Sentry para listar as falhas.",
            error: "org/project ausente",
          };
        }

        const query = encodeURIComponent(String(ctx.params.query || "is:unresolved"));
        const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=${query}&limit=10`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: await handleHttpError(res, "Sentry"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const issues = (data || []).map((i: any) => ({
          id: i.id,
          shortId: i.shortId,
          title: i.title,
          culprit: i.culprit,
          count: i.count,
          userCount: i.userCount,
          lastSeen: i.lastSeen,
          level: i.level,
          permalink: i.permalink,
        }));

        let summary = `🛡️ **Erros Não Resolvidos no Sentry (${issues.length} ocorrências recentes)**:\n\n`;
        if (issues.length === 0) {
          summary += "🎉 Nenhum erro não resolvido encontrado no projeto!";
        } else {
          issues.forEach((i: any, idx: number) => {
            summary += `${idx + 1}. **[${i.shortId || i.id}] ${i.title}**\n   - Impacto: ${i.count} eventos (${i.userCount} utilizadores) | Nível: \`${i.level}\`\n   - Origem: ${i.culprit || "N/A"}\n   - Link: [${i.permalink}](${i.permalink})\n`;
          });
        }

        return {
          success: true,
          connector: "sentry",
          action: ctx.action,
          summary,
          data: issues,
        };
      }

      case "get_issue":
      case "issues.get":
      case "issue.get": {
        const issueId = String(ctx.params.issue_id || ctx.params.issueId || ctx.params.id || "").trim();
        if (!issueId) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `issue_id` do erro no Sentry.",
            error: "issue_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/issues/${encodeURIComponent(issueId)}/`, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: await handleHttpError(res, "Sentry"),
            error: `HTTP ${res.status}`,
          };
        }

        const i = await res.json();
        const summary =
          `🛡️ **Detalhes do Erro Sentry [${i.shortId || i.id}]**\n\n` +
          `- **Título**: ${i.title}\n` +
          `- **Status**: \`${i.status}\`\n` +
          `- **Origem / Culprit**: ${i.culprit}\n` +
          `- **Ocorrências**: ${i.count} eventos (${i.userCount} utilizadores afetados)\n` +
          `- **Primeira ocorrência**: ${i.firstSeen}\n` +
          `- **Última ocorrência**: ${i.lastSeen}\n` +
          `- **Link**: [${i.permalink}](${i.permalink})`;

        return {
          success: true,
          connector: "sentry",
          action: ctx.action,
          summary,
          data: i,
        };
      }

      case "resolve_issue":
      case "issues.resolve":
      case "issue.resolve": {
        const issueId = String(ctx.params.issue_id || ctx.params.issueId || ctx.params.id || "").trim();
        if (!issueId) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `issue_id` do erro a marcar como resolvido.",
            error: "issue_id ausente",
          };
        }

        const res = await fetch(`${BASE_URL}/issues/${encodeURIComponent(issueId)}/`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status: "resolved" }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "sentry",
            action: ctx.action,
            summary: await handleHttpError(res, "Sentry"),
            error: `HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        return {
          success: true,
          connector: "sentry",
          action: ctx.action,
          summary: `✅ **Issue ${data.shortId || issueId} marcada como RESOLVIDA no Sentry!**`,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "sentry",
          action: ctx.action,
          summary: `❌ **Ação '${ctx.action}' não reconhecida no conector Sentry.**\nAções disponíveis: projects.list, issues.list, issues.get, issues.resolve.`,
          error: `Ação não suportada: ${ctx.action}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "sentry",
      action: ctx.action,
      summary: `❌ **Falha ao comunicar com Sentry**: ${err.message || String(err)}`,
      error: String(err),
    };
  }
}

// ============================================================================
// DISPACHADOR DO LOTE 3
// ============================================================================

export async function executeBatch3Connector(
  connectorName: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const norm = connectorName.toLowerCase().trim();

  switch (norm) {
    case "linear":
      return executeLinear(ctx);

    case "notion":
      return executeNotion(ctx);

    case "slack":
      return executeSlack(ctx);

    case "trello":
      return executeTrello(ctx);

    case "sentry":
      return executeSentry(ctx);

    default:
      return {
        success: false,
        connector: connectorName,
        action: ctx.action,
        summary:
          `⚠️ O conector **${connectorName}** pertence aos próximos lotes. ` +
          `Conectores ativos no Lote 3: **Linear**, **Notion**, **Slack**, **Trello** e **Sentry**.`,
        error: "Conector não suportado no Lote 3",
      };
  }
}
