/**
 * GRIOT Connectors Engine - Batch 5
 * Conectores de Produção para IA, Comunicação, Nuvem & Armazenamento:
 * 1. Hugging Face (Modelos Open-Source, IA & Inference API)
 * 2. Gmail (Google Workspace, Leitura e Envio de Emails)
 * 3. Microsoft Outlook (Microsoft 365, Graph API, Emails & Calendário)
 * 4. Dropbox (Armazenamento na Nuvem, Ficheiros & Links Temporários)
 * 5. PlanetScale (MySQL Serverless, Branching de Schemas)
 *
 * Implementação sem atalhos ou mocks, com tratamento inteligente de códigos HTTP,
 * suporte a parâmetros e respostas formatadas em Markdown em português.
 */

export interface ConnectorExecutionContext {
  credential?: string;
  action: string;
  params: Record<string, any>;
  accountName?: string;
  customEndpoint?: string;
}

export interface ConnectorExecutionResponse {
  success: boolean;
  connector: string;
  action: string;
  summary: string;
  data?: any;
  error?: string;
}

async function handleHttpError(res: Response, serviceName: string): Promise<string> {
  let detail = "";
  try {
    const json = await res.json();
    detail = json.error?.message || json.error_description || json.error || json.message || JSON.stringify(json);
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = res.statusText;
    }
  }

  const cleanDetail = detail && typeof detail === "string" ? detail.slice(0, 300) : "";
  const suffix = cleanDetail ? " (Detalhes: " + cleanDetail + ")" : "";

  switch (res.status) {
    case 401:
      return "⚠️ **Autenticação Falhou no " + serviceName + " (401)**: A credencial ou token fornecido é inválido, expirou ou não possui as permissões necessárias. Atualiza a credencial em **Definições → Plugins**." + suffix;
    case 403:
      return "⚠️ **Acesso Proibido no " + serviceName + " (403)**: A conta ou token não tem privilégios para executar esta ação." + suffix;
    case 404:
      return "⚠️ **Recurso Não Encontrado no " + serviceName + " (404)**: O modelo, pasta, email, base de dados ou branch solicitado não existe ou está inacessível." + suffix;
    case 429:
      return "⚠️ **Limite de Requisições Atingido no " + serviceName + " (429)**: Excedeste o rate limit da API. Aguarda alguns instantes antes de tentar novamente." + suffix;
    case 500:
    case 502:
    case 503:
      return "⚠️ **Erro no Servidor do " + serviceName + " (" + res.status + ")**: O serviço está temporariamente indisponível." + suffix;
    default:
      return "⚠️ **Erro na API do " + serviceName + " (" + res.status + ")**" + suffix;
  }
}

// ==========================================
// 1. CONECTOR HUGGING FACE (IA & Modelos)
// ==========================================
export async function executeHuggingFace(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  const BASE_API = "https://huggingface.co/api";
  const INFERENCE_API = "https://api-inference.huggingface.co/models";

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (cred) {
    headers["Authorization"] = "Bearer " + cred;
  }

  try {
    switch (ctx.action) {
      case "get_whoami":
      case "whoami":
      case "whoami.get":
      case "profile":
      case "me": {
        if (!cred) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: "⚠️ **Hugging Face Não Conectado**: Para consultar a tua identidade e organizações, configura o teu User Access Token (`hf_...`) em **Definições → Plugins → Hugging Face**.",
            error: "Token HF ausente",
          };
        }

        const res = await fetch(BASE_API + "/whoami-v2", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: await handleHttpError(res, "Hugging Face"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const orgs = (data.orgs || []).map((o: any) => o.name).join(", ") || "Nenhuma";
        let summary = "🤗 **Identidade Hugging Face Verificada**:\n\n";
        summary += "• **Utilizador**: `" + (data.name || data.fullname || "N/D") + "`\n";
        summary += "• **Email**: " + (data.email || "Privado") + "\n";
        summary += "• **Tipo**: " + (data.type || "user") + "\n";
        summary += "• **Organizações**: " + orgs + "\n";
        summary += "• **Pro / Subscrição**: " + (data.isPro ? "⭐ Ativo (HF Pro)" : "Gratuito") + "\n";

        return {
          success: true,
          connector: "huggingface",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_model":
      case "models.get":
      case "model.get":
      case "model": {
        const modelId = ctx.params.model_id || ctx.params.model || ctx.params.name;
        if (!modelId) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o ID do modelo no Hugging Face em `model_id` (ex: `meta-llama/Llama-3-8B` ou `openai/whisper-large-v3`).",
            error: "model_id ausente",
          };
        }

        const res = await fetch(BASE_API + "/models/" + encodeURIComponent(modelId), { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: await handleHttpError(res, "Hugging Face"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🤗 **Detalhes do Modelo HF**: `" + (data.id || modelId) + "`\n\n";
        summary += "• **Tarefa / Pipeline**: `" + (data.pipeline_tag || "Geral / Desconhecida") + "`\n";
        summary += "• **Downloads**: " + (data.downloads ? data.downloads.toLocaleString("pt-PT") : 0) + "\n";
        summary += "• **Likes / Favoritos**: " + (data.likes ? data.likes.toLocaleString("pt-PT") : 0) + " ❤️\n";
        summary += "• **Autor**: " + (data.author || "Comunidade") + "\n";
        summary += "• **Privacidade**: " + (data.private ? "🔒 Privado" : "🌐 Público") + "\n";
        if (data.tags && data.tags.length > 0) {
          summary += "• **Tags**: " + data.tags.slice(0, 6).map((t: string) => "`" + t + "`").join(", ") + "\n";
        }
        if (data.cardData?.license) {
          summary += "• **Licença**: `" + data.cardData.license + "`\n";
        }

        return {
          success: true,
          connector: "huggingface",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_models":
      case "models.list":
      case "models": {
        const query = ctx.params.query || ctx.params.search || ctx.params.filter || "";
        const limit = Number(ctx.params.limit) || 8;
        const pipeline = ctx.params.pipeline || ctx.params.task;

        let url = BASE_API + "/models?sort=downloads&direction=-1&limit=" + limit;
        if (query) url += "&search=" + encodeURIComponent(query);
        if (pipeline) url += "&pipeline_tag=" + encodeURIComponent(pipeline);

        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: await handleHttpError(res, "Hugging Face"),
            error: res.statusText,
          };
        }

        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) {
          return {
            success: true,
            connector: "huggingface",
            action: ctx.action,
            summary: "ℹ️ Nenhum modelo encontrado no Hugging Face para a busca `" + query + "`.",
            data: [],
          };
        }

        let summary = "🤗 **Modelos Populares no Hugging Face**" + (query ? " para '`" + query + "`'" : "") + " (Top " + list.length + "):\n\n";
        list.forEach((m: any, idx: number) => {
          summary += (idx + 1) + ". **`" + m.id + "`**\n";
          summary += "   • Pipeline: `" + (m.pipeline_tag || "geral") + "` | Downloads: " + (m.downloads ? m.downloads.toLocaleString("pt-PT") : 0) + " | Likes: " + (m.likes || 0) + " ❤️\n";
        });

        return {
          success: true,
          connector: "huggingface",
          action: ctx.action,
          summary,
          data: list,
        };
      }

      case "run_inference":
      case "inference.run":
      case "infer":
      case "predict": {
        if (!cred) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: "⚠️ **Hugging Face Não Conectado**: A Serverless Inference API requer um User Access Token (`hf_...`). Configura-o em **Definições → Plugins → Hugging Face**.",
            error: "Token HF ausente",
          };
        }

        const modelId = ctx.params.model_id || ctx.params.model;
        const inputs = ctx.params.inputs || ctx.params.prompt || ctx.params.text;
        if (!modelId || !inputs) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Fornece o `model_id` (ex: `google/flan-t5-base`) e os dados de entrada em `inputs`.",
            error: "model_id ou inputs ausentes",
          };
        }

        const inferHeaders: Record<string, string> = {
          ...headers,
          "Content-Type": "application/json",
        };

        const res = await fetch(INFERENCE_API + "/" + modelId, {
          method: "POST",
          headers: inferHeaders,
          body: JSON.stringify({
            inputs,
            parameters: ctx.params.parameters || {},
            options: { wait_for_model: true },
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "huggingface",
            action: ctx.action,
            summary: await handleHttpError(res, "Hugging Face Inference"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🤗 **Inferência Executada com Sucesso no Hugging Face**:\n\n";
        summary += "• **Modelo**: `" + modelId + "`\n";
        summary += "• **Entrada**: `" + (typeof inputs === "string" ? inputs.slice(0, 150) : JSON.stringify(inputs)) + "`\n\n";
        summary += "**Resultado da Inferência**:\n```json\n" + JSON.stringify(data, null, 2).slice(0, 1500) + "\n```";

        return {
          success: true,
          connector: "huggingface",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "huggingface",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Hugging Face: `" + ctx.action + "`. Ações suportadas: `get_whoami`, `get_model`, `list_models`, `run_inference`.",
          error: "Ação inválida",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "huggingface",
      action: ctx.action,
      summary: "❌ Erro ao comunicar com Hugging Face: " + (err.message || String(err)),
      error: err.message,
    };
  }
}

// ==========================================
// 2. CONECTOR GMAIL (Google Workspace Mail)
// ==========================================
export async function executeGmail(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "gmail",
      action: ctx.action,
      summary: "⚠️ **Gmail Não Conectado**: Insere o teu Google OAuth 2.0 Access Token com escopos Gmail em **Definições → Plugins → Gmail**.",
      error: "Credencial Gmail ausente",
    };
  }

  const BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
  const headers = {
    Authorization: "Bearer " + cred,
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "get_profile":
      case "profile.get":
      case "profile":
      case "me": {
        const res = await fetch(BASE_URL + "/profile", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: await handleHttpError(res, "Gmail"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "📧 **Perfil Gmail Conectado**:\n\n";
        summary += "• **Endereço de Email**: `" + (data.emailAddress || "Desconhecido") + "`\n";
        summary += "• **Total de Mensagens**: " + (data.messagesTotal ? data.messagesTotal.toLocaleString("pt-PT") : 0) + "\n";
        summary += "• **Total de Threads**: " + (data.threadsTotal ? data.threadsTotal.toLocaleString("pt-PT") : 0) + "\n";
        summary += "• **History ID**: `" + (data.historyId || "N/D") + "`\n";

        return {
          success: true,
          connector: "gmail",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_messages":
      case "messages.list":
      case "messages":
      case "emails.list": {
        const limit = Number(ctx.params.limit) || 8;
        const query = ctx.params.query || ctx.params.q || "";

        let url = BASE_URL + "/messages?maxResults=" + limit;
        if (query) url += "&q=" + encodeURIComponent(query);

        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: await handleHttpError(res, "Gmail"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const messages = data.messages || [];
        if (messages.length === 0) {
          return {
            success: true,
            connector: "gmail",
            action: ctx.action,
            summary: "ℹ️ Nenhuma mensagem encontrada no Gmail" + (query ? " para a pesquisa '`" + query + "`'" : "") + ".",
            data: [],
          };
        }

        let summary = "📧 **Mensagens Recentes no Gmail**" + (query ? " (Filtro: '`" + query + "`')" : "") + " (" + messages.length + " encontradas):\n\n";
        messages.forEach((m: any, idx: number) => {
          summary += (idx + 1) + ". ID: `" + m.id + "` (Thread: `" + m.threadId + "`)\n";
        });
        summary += "\n💡 *Usa a ação `get_message` passando `message_id` para ler o assunto, remetente e corpo de uma mensagem.*";

        return {
          success: true,
          connector: "gmail",
          action: ctx.action,
          summary,
          data: messages,
        };
      }

      case "get_message":
      case "messages.get":
      case "message.get":
      case "emails.get": {
        const messageId = ctx.params.message_id || ctx.params.id;
        if (!messageId) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o ID da mensagem no parâmetro `message_id`.",
            error: "message_id ausente",
          };
        }

        const res = await fetch(BASE_URL + "/messages/" + encodeURIComponent(messageId) + "?format=full", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: await handleHttpError(res, "Gmail"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const headersList = data.payload?.headers || [];
        const findHeader = (name: string) => {
          const h = headersList.find((item: any) => item.name?.toLowerCase() === name.toLowerCase());
          return h ? h.value : "N/D";
        };

        const subject = findHeader("Subject");
        const from = findHeader("From");
        const to = findHeader("To");
        const date = findHeader("Date");
        const snippet = data.snippet || "Sem excerto de texto disponível";

        let summary = "📧 **Mensagem do Gmail**: `" + subject + "`\n\n";
        summary += "• **De**: " + from + "\n";
        summary += "• **Para**: " + to + "\n";
        summary += "• **Data**: " + date + "\n";
        summary += "• **ID**: `" + data.id + "`\n\n";
        summary += "**Excerto do Conteúdo**:\n> " + snippet + "\n";

        return {
          success: true,
          connector: "gmail",
          action: ctx.action,
          summary,
          data: { id: data.id, threadId: data.threadId, subject, from, to, date, snippet },
        };
      }

      case "send_email":
      case "messages.send":
      case "emails.send":
      case "send": {
        const to = ctx.params.to || ctx.params.recipient;
        const subject = ctx.params.subject || ctx.params.title || "Mensagem enviada via GRIOT Mobile";
        const body = ctx.params.body || ctx.params.message || ctx.params.text || "";

        if (!to) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Fornece o destinatário no parâmetro `to` (ex: `cliente@exemplo.com`).",
            error: "to ausente",
          };
        }

        // Construir mensagem MIME RFC 2822 e codificar em base64url
        const emailLines = [
          "To: " + to,
          "Subject: =?utf-8?B?" + Buffer.from(subject).toString("base64") + "?=",
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: 7bit",
          "",
          body,
        ];
        const rawEmail = emailLines.join("\r\n");
        const encodedEmail = Buffer.from(rawEmail)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const res = await fetch(BASE_URL + "/messages/send", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedEmail }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "gmail",
            action: ctx.action,
            summary: await handleHttpError(res, "Gmail"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "✅ **E-mail Enviado com Sucesso via Gmail**:\n\n";
        summary += "• **Destinatário**: `" + to + "`\n";
        summary += "• **Assunto**: " + subject + "\n";
        summary += "• **ID da Mensagem**: `" + data.id + "`\n";
        summary += "• **Thread ID**: `" + data.threadId + "`\n";

        return {
          success: true,
          connector: "gmail",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "gmail",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Gmail: `" + ctx.action + "`. Ações suportadas: `get_profile`, `list_messages`, `get_message`, `send_email`.",
          error: "Ação inválida",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "gmail",
      action: ctx.action,
      summary: "❌ Erro ao comunicar com Gmail: " + (err.message || String(err)),
      error: err.message,
    };
  }
}

// ==========================================
// 3. CONECTOR OUTLOOK (Microsoft Graph 365)
// ==========================================
export async function executeOutlook(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "outlook",
      action: ctx.action,
      summary: "⚠️ **Microsoft Outlook Não Conectado**: Insere o teu Microsoft Graph OAuth Token em **Definições → Plugins → Microsoft Outlook**.",
      error: "Credencial Outlook ausente",
    };
  }

  const BASE_URL = "https://graph.microsoft.com/v1.0/me";
  const headers = {
    Authorization: "Bearer " + cred,
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "get_me":
      case "me":
      case "profile":
      case "user.get": {
        const res = await fetch(BASE_URL, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "outlook",
            action: ctx.action,
            summary: await handleHttpError(res, "Microsoft Outlook"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🏢 **Conta Microsoft 365 / Outlook Conectada**:\n\n";
        summary += "• **Nome**: `" + (data.displayName || "N/D") + "`\n";
        summary += "• **Email**: " + (data.mail || data.userPrincipalName || "N/D") + "\n";
        summary += "• **Cargo**: " + (data.jobTitle || "Não especificado") + "\n";
        summary += "• **ID Microsoft**: `" + (data.id || "N/D") + "`\n";

        return {
          success: true,
          connector: "outlook",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_messages":
      case "messages.list":
      case "messages":
      case "emails.list": {
        const limit = Number(ctx.params.limit) || 8;
        const res = await fetch(BASE_URL + "/messages?$top=" + limit + "&$orderby=receivedDateTime%20desc", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "outlook",
            action: ctx.action,
            summary: await handleHttpError(res, "Microsoft Outlook"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const messages = data.value || [];
        if (messages.length === 0) {
          return {
            success: true,
            connector: "outlook",
            action: ctx.action,
            summary: "ℹ️ Nenhuma mensagem recente encontrada na Caixa de Entrada do Outlook.",
            data: [],
          };
        }

        let summary = "📨 **Mensagens Recentes no Outlook** (Últimas " + messages.length + "):\n\n";
        messages.forEach((m: any, idx: number) => {
          const from = m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Desconhecido";
          const subject = m.subject || "(Sem assunto)";
          const date = m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleDateString("pt-PT") : "N/D";
          summary += (idx + 1) + ". **" + subject + "**\n";
          summary += "   • De: " + from + " | Data: " + date + " | Lido: " + (m.isRead ? "Sim" : "🔹 **Não lido**") + "\n";
          summary += "   • ID: `" + m.id + "`\n";
        });

        return {
          success: true,
          connector: "outlook",
          action: ctx.action,
          summary,
          data: messages,
        };
      }

      case "send_mail":
      case "send_email":
      case "messages.send":
      case "emails.send":
      case "send": {
        const to = ctx.params.to || ctx.params.recipient;
        const subject = ctx.params.subject || ctx.params.title || "Mensagem de GRIOT Mobile";
        const body = ctx.params.body || ctx.params.message || ctx.params.text || "";

        if (!to) {
          return {
            success: false,
            connector: "outlook",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Fornece o destinatário em `to`.",
            error: "to ausente",
          };
        }

        const mailPayload = {
          message: {
            subject,
            body: {
              contentType: "Text",
              content: body,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: to,
                },
              },
            ],
          },
          saveToSentItems: "true",
        };

        const res = await fetch(BASE_URL + "/sendMail", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mailPayload),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "outlook",
            action: ctx.action,
            summary: await handleHttpError(res, "Microsoft Outlook"),
            error: res.statusText,
          };
        }

        let summary = "✅ **E-mail Enviado com Sucesso via Microsoft Outlook**:\n\n";
        summary += "• **Destinatário**: `" + to + "`\n";
        summary += "• **Assunto**: " + subject + "\n";
        summary += "• **Status**: Despachado com sucesso para a pasta Itens Enviados.\n";

        return {
          success: true,
          connector: "outlook",
          action: ctx.action,
          summary,
        };
      }

      case "list_events":
      case "events.list":
      case "events":
      case "calendar.list": {
        const limit = Number(ctx.params.limit) || 6;
        const res = await fetch(BASE_URL + "/events?$top=" + limit + "&$orderby=start/dateTime%20asc", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "outlook",
            action: ctx.action,
            summary: await handleHttpError(res, "Microsoft Outlook Calendário"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const events = data.value || [];
        if (events.length === 0) {
          return {
            success: true,
            connector: "outlook",
            action: ctx.action,
            summary: "ℹ️ Nenhum evento ou reunião agendada no calendário Outlook.",
            data: [],
          };
        }

        let summary = "📅 **Próximos Compromissos no Calendário Outlook** (" + events.length + "):\n\n";
        events.forEach((ev: any, idx: number) => {
          const start = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString("pt-PT") : "N/D";
          const end = ev.end?.dateTime ? new Date(ev.end.dateTime).toLocaleTimeString("pt-PT") : "N/D";
          summary += (idx + 1) + ". **" + (ev.subject || "Reunião") + "**\n";
          summary += "   • Horário: " + start + " até " + end + "\n";
          if (ev.location?.displayName) {
            summary += "   • Local: " + ev.location.displayName + "\n";
          }
          if (ev.isOnlineMeeting) {
            summary += "   • Reunião Online: " + (ev.onlineMeetingProvider || "Teams / Web") + "\n";
          }
        });

        return {
          success: true,
          connector: "outlook",
          action: ctx.action,
          summary,
          data: events,
        };
      }

      default:
        return {
          success: false,
          connector: "outlook",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Microsoft Outlook: `" + ctx.action + "`. Ações suportadas: `get_me`, `list_messages`, `send_mail`, `list_events`.",
          error: "Ação inválida",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "outlook",
      action: ctx.action,
      summary: "❌ Erro ao comunicar com Microsoft Outlook: " + (err.message || String(err)),
      error: err.message,
    };
  }
}

// ==========================================
// 4. CONECTOR DROPBOX (Armazenamento Cloud)
// ==========================================
export async function executeDropbox(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "dropbox",
      action: ctx.action,
      summary: "⚠️ **Dropbox Não Conectado**: Insere o teu Dropbox Access Token (`sl.u....`) em **Definições → Plugins → Dropbox**.",
      error: "Credencial Dropbox ausente",
    };
  }

  const BASE_URL = "https://api.dropboxapi.com/2";
  const headers = {
    Authorization: "Bearer " + cred,
    "Content-Type": "application/json",
  };

  try {
    switch (ctx.action) {
      case "get_space_usage":
      case "space.get":
      case "quota":
      case "usage": {
        const res = await fetch(BASE_URL + "/users/get_space_usage", {
          method: "POST",
          headers,
          body: "null",
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: await handleHttpError(res, "Dropbox"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const usedBytes = data.used || 0;
        const allocatedBytes = data.allocation?.allocated || 0;
        const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
        const totalGb = allocatedBytes ? (allocatedBytes / (1024 * 1024 * 1024)).toFixed(2) : "Ilimitado";
        const percent = allocatedBytes ? Math.round((usedBytes / allocatedBytes) * 100) : 0;

        let summary = "📦 **Quota de Armazenamento Dropbox**:\n\n";
        summary += "• **Espaço Utilizado**: " + usedGb + " GB de " + totalGb + " GB (" + percent + "%)\n";
        summary += "• **Tipo de Alocação**: " + (data.allocation?.[".tag"] || "individual") + "\n";

        return {
          success: true,
          connector: "dropbox",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_folder":
      case "files.list":
      case "folder.list":
      case "list": {
        const rawPath = ctx.params.folder_path !== undefined ? ctx.params.folder_path : (ctx.params.path || "");
        const folderPath = rawPath === "/" ? "" : rawPath;
        const limit = Number(ctx.params.limit) || 12;

        const res = await fetch(BASE_URL + "/files/list_folder", {
          method: "POST",
          headers,
          body: JSON.stringify({
            path: folderPath,
            recursive: false,
            include_media_info: false,
            limit,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: await handleHttpError(res, "Dropbox"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const entries = data.entries || [];
        if (entries.length === 0) {
          return {
            success: true,
            connector: "dropbox",
            action: ctx.action,
            summary: "ℹ️ A pasta `" + (folderPath || "/") + "` no Dropbox está vazia.",
            data: [],
          };
        }

        let summary = "📁 **Ficheiros e Pastas no Dropbox** (`" + (folderPath || "/") + "`):\n\n";
        entries.forEach((entry: any, idx: number) => {
          const isFolder = entry[".tag"] === "folder";
          const icon = isFolder ? "📁" : "📄";
          const sizeMb = entry.size ? (entry.size / (1024 * 1024)).toFixed(2) + " MB" : "";
          summary += (idx + 1) + ". " + icon + " **" + entry.name + "**\n";
          summary += "   • Caminho: `" + entry.path_display + "`" + (sizeMb ? " | Tamanho: " + sizeMb : "") + "\n";
        });

        return {
          success: true,
          connector: "dropbox",
          action: ctx.action,
          summary,
          data: entries,
        };
      }

      case "get_metadata":
      case "files.get":
      case "metadata.get":
      case "file": {
        const filePath = ctx.params.path || ctx.params.file_path;
        if (!filePath) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Fornece o caminho do ficheiro em `path` (ex: `/relatorios/documento.pdf`).",
            error: "path ausente",
          };
        }

        const res = await fetch(BASE_URL + "/files/get_metadata", {
          method: "POST",
          headers,
          body: JSON.stringify({ path: filePath }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: await handleHttpError(res, "Dropbox"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const isFolder = data[".tag"] === "folder";
        let summary = (isFolder ? "📁" : "📄") + " **Metadados Dropbox**: `" + data.name + "`\n\n";
        summary += "• **Caminho**: `" + data.path_display + "`\n";
        summary += "• **Tipo**: " + (isFolder ? "Pasta" : "Ficheiro") + "\n";
        if (data.size !== undefined) {
          summary += "• **Tamanho**: " + (data.size / (1024 * 1024)).toFixed(2) + " MB (" + data.size.toLocaleString("pt-PT") + " bytes)\n";
        }
        if (data.server_modified) {
          summary += "• **Última Modificação**: " + new Date(data.server_modified).toLocaleString("pt-PT") + "\n";
        }
        summary += "• **ID**: `" + data.id + "`\n";

        return {
          success: true,
          connector: "dropbox",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_temporary_link":
      case "links.get":
      case "download_link":
      case "link": {
        const filePath = ctx.params.path || ctx.params.file_path;
        if (!filePath) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Fornece o caminho do ficheiro em `path` para gerar o link direto.",
            error: "path ausente",
          };
        }

        const res = await fetch(BASE_URL + "/files/get_temporary_link", {
          method: "POST",
          headers,
          body: JSON.stringify({ path: filePath }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "dropbox",
            action: ctx.action,
            summary: await handleHttpError(res, "Dropbox"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🔗 **Link Temporário de Download Gerado no Dropbox**:\n\n";
        summary += "• **Ficheiro**: `" + data.metadata?.name + "`\n";
        summary += "• **Link Direto**: " + data.link + "\n";
        summary += "• **Validade**: Este link expira em 4 horas.\n";

        return {
          success: true,
          connector: "dropbox",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "dropbox",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Dropbox: `" + ctx.action + "`. Ações suportadas: `get_space_usage`, `list_folder`, `get_metadata`, `get_temporary_link`.",
          error: "Ação inválida",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "dropbox",
      action: ctx.action,
      summary: "❌ Erro ao comunicar com Dropbox: " + (err.message || String(err)),
      error: err.message,
    };
  }
}

// ==========================================
// 5. CONECTOR PLANETSCALE (MySQL Serverless)
// ==========================================
export async function executePlanetScale(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "planetscale",
      action: ctx.action,
      summary: "⚠️ **PlanetScale Não Conectado**: Insere o teu Service Token (`pscale_tkn_...`) em **Definições → Plugins → PlanetScale**.",
      error: "Credencial PlanetScale ausente",
    };
  }

  const BASE_URL = "https://api.planetscale.com/v1";
  const headers = {
    Authorization: cred,
    Accept: "application/json",
  };

  // Extrair organização
  const org = (ctx.params.organization || ctx.params.org || ctx.accountName || "").trim();

  try {
    switch (ctx.action) {
      case "list_databases":
      case "databases.list":
      case "databases":
      case "dbs": {
        if (!org) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: "⚠️ **Organização em falta**: Especifica o nome da organização PlanetScale em `organization` ou nas definições de conta do plugin.",
            error: "organization ausente",
          };
        }

        const res = await fetch(BASE_URL + "/organizations/" + encodeURIComponent(org) + "/databases", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: await handleHttpError(res, "PlanetScale"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const dbs = data.data || [];
        if (dbs.length === 0) {
          return {
            success: true,
            connector: "planetscale",
            action: ctx.action,
            summary: "ℹ️ Nenhuma base de dados encontrada na organização `" + org + "`.",
            data: [],
          };
        }

        let summary = "🐬 **Bases de Dados PlanetScale** (Organização: `" + org + "`):\n\n";
        dbs.forEach((db: any, idx: number) => {
          summary += (idx + 1) + ". **`" + db.name + "`**\n";
          summary += "   • Região: `" + (db.region?.slug || db.region?.name || "Global") + "` | Branches: " + (db.branches_count || 1) + "\n";
          summary += "   • Estado: " + (db.state === "ready" ? "🟢 Ativa / Pronta" : db.state) + "\n";
        });

        return {
          success: true,
          connector: "planetscale",
          action: ctx.action,
          summary,
          data: dbs,
        };
      }

      case "get_database":
      case "databases.get":
      case "db.get":
      case "database": {
        const dbName = ctx.params.database || ctx.params.name;
        if (!org || !dbName) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Fornece a `organization` e o nome da base de dados em `database`.",
            error: "organization ou database ausente",
          };
        }

        const res = await fetch(BASE_URL + "/organizations/" + encodeURIComponent(org) + "/databases/" + encodeURIComponent(dbName), { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: await handleHttpError(res, "PlanetScale"),
            error: res.statusText,
          };
        }

        const db = await res.json();
        let summary = "🐬 **Base de Dados PlanetScale**: `" + db.name + "`\n\n";
        summary += "• **Organização**: `" + org + "`\n";
        summary += "• **Região**: `" + (db.region?.slug || "N/D") + "` (" + (db.region?.display_name || "") + ")\n";
        summary += "• **Branch Padrão**: `" + (db.default_branch || "main") + "`\n";
        summary += "• **Contagem de Branches**: " + (db.branches_count || 1) + "\n";
        summary += "• **Status**: " + (db.state === "ready" ? "🟢 Operacional" : db.state) + "\n";

        return {
          success: true,
          connector: "planetscale",
          action: ctx.action,
          summary,
          data: db,
        };
      }

      case "list_branches":
      case "branches.list":
      case "branches": {
        const dbName = ctx.params.database || ctx.params.name;
        if (!org || !dbName) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica `organization` e `database` para listar as branches.",
            error: "organization ou database ausente",
          };
        }

        const res = await fetch(BASE_URL + "/organizations/" + encodeURIComponent(org) + "/databases/" + encodeURIComponent(dbName) + "/branches", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: await handleHttpError(res, "PlanetScale"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const branches = data.data || [];
        if (branches.length === 0) {
          return {
            success: true,
            connector: "planetscale",
            action: ctx.action,
            summary: "ℹ️ Nenhuma branch encontrada para a base `" + dbName + "`.",
            data: [],
          };
        }

        let summary = "🌿 **Branches da Base de Dados** `" + dbName + "` (" + branches.length + "):\n\n";
        branches.forEach((b: any, idx: number) => {
          const isProd = b.production ? "🛡️ **Produção**" : "🛠️ Desenvolvimento";
          summary += (idx + 1) + ". **`" + b.name + "`** (" + isProd + ")\n";
          summary += "   • Estado: " + (b.ready ? "🟢 Pronta" : "🟡 A criar") + " | Região: `" + (b.region?.slug || "Padrão") + "`\n";
        });

        return {
          success: true,
          connector: "planetscale",
          action: ctx.action,
          summary,
          data: branches,
        };
      }

      case "create_branch":
      case "branches.create":
      case "branch.create": {
        const dbName = ctx.params.database || ctx.params.name;
        const branchName = ctx.params.branch_name || ctx.params.branch;
        const parentBranch = ctx.params.parent_branch || "main";

        if (!org || !dbName || !branchName) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Fornece `organization`, `database` e o novo `branch_name`.",
            error: "organization, database ou branch_name ausente",
          };
        }

        const res = await fetch(BASE_URL + "/organizations/" + encodeURIComponent(org) + "/databases/" + encodeURIComponent(dbName) + "/branches", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: branchName,
            parent_branch: parentBranch,
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "planetscale",
            action: ctx.action,
            summary: await handleHttpError(res, "PlanetScale"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "✅ **Branch PlanetScale Criada com Sucesso**:\n\n";
        summary += "• **Base de Dados**: `" + dbName + "`\n";
        summary += "• **Nova Branch**: `" + branchName + "`\n";
        summary += "• **Branch de Origem (Parent)**: `" + parentBranch + "`\n";
        summary += "• **Estado**: " + (data.ready ? "🟢 Pronta para uso" : "🟡 Em inicialização") + "\n";

        return {
          success: true,
          connector: "planetscale",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "planetscale",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para PlanetScale: `" + ctx.action + "`. Ações suportadas: `list_databases`, `get_database`, `list_branches`, `create_branch`.",
          error: "Ação inválida",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "planetscale",
      action: ctx.action,
      summary: "❌ Erro ao comunicar com PlanetScale: " + (err.message || String(err)),
      error: err.message,
    };
  }
}

// ==========================================
// DISPATCHER PRINCIPAL DO LOTE 5
// ==========================================
export async function executeBatch5Connector(
  connectorId: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const normId = connectorId.toLowerCase().trim();

  switch (normId) {
    case "huggingface":
    case "hf":
      return executeHuggingFace(ctx);
    case "gmail":
      return executeGmail(ctx);
    case "outlook":
    case "microsoft_outlook":
      return executeOutlook(ctx);
    case "dropbox":
      return executeDropbox(ctx);
    case "planetscale":
    case "pscale":
      return executePlanetScale(ctx);
    default:
      return {
        success: false,
        connector: connectorId,
        action: ctx.action,
        summary: "⚠️ O conector **" + connectorId + "** não pertence ao Lote 5.",
        error: "Conector não suportado no Lote 5",
      };
  }
}
