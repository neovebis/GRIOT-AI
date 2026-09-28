/* eslint-disable max-lines */
/**
 * GRIOT Mobile - Sistema de Conectores de Produção (Lote 4)
 * Conectores: Stripe, Google Sheets, Google Drive, Figma, Docker Hub
 *
 * Características:
 * - Implementação real sem mocks
 * - Validação rigorosa de tokens e parâmetros
 * - Tratamento inteligente de erros HTTP (401, 403, 404, 429, 500) com mensagens em português
 * - Formatação rica em Markdown para exibição no chat
 */

export interface ConnectorExecutionContext {
  credential?: string;
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

// ==========================================
// UTILITÁRIOS GLOBAIS DE TRATAMENTO DE ERRO
// ==========================================
async function handleHttpError(res: Response, serviceName: string): Promise<string> {
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = res.statusText;
  }

  let errorDetail = "";
  try {
    const json = JSON.parse(bodyText);
    errorDetail = json.error?.message || json.error?.description || json.message || json.detail || bodyText.slice(0, 300);
  } catch {
    errorDetail = bodyText.slice(0, 300);
  }

  switch (res.status) {
    case 401:
      return "⚠️ **Erro de Autenticação (401)**: A credencial ou token do " + serviceName + " é inválido, expirou ou foi revogado. Atualiza em Definições → Plugins.";
    case 403:
      return "🚫 **Permissão Negada (403)**: A tua credencial do " + serviceName + " não tem privilégios suficientes para executar esta ação ou o recurso é restrito.\nDetalhe: " + errorDetail;
    case 404:
      return "🔍 **Não Encontrado (404)**: O recurso, ficheiro, tabela ou item solicitado no " + serviceName + " não foi encontrado. Verifica os identificadores.";
    case 429:
      return "⏱️ **Limite de Taxa Excedido (429)**: Muitas requisições ao " + serviceName + ". Aguarda alguns segundos antes de tentar novamente.";
    case 500:
    case 502:
    case 503:
      return "🔥 **Instabilidade no Serviço (" + res.status + ")**: Os servidores do " + serviceName + " estão temporariamente indisponíveis.";
    default:
      return "⚠️ **Erro HTTP " + res.status + " no " + serviceName + "**: " + errorDetail;
  }
}

// ==========================================
// 1. CONECTOR STRIPE (Finanças & Faturação)
// ==========================================
export async function executeStripe(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "stripe",
      action: ctx.action,
      summary: "⚠️ **Stripe Não Conectado**: Insere a tua Secret Key (sk_live_... / sk_test_...) ou Restricted Key (rk_...) em Definições → Plugins → Stripe.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = (ctx.customEndpoint || "https://api.stripe.com/v1").replace(/\/+$/, "");
  const headers = {
    Authorization: "Bearer " + cred,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": "2024-06-20",
  };

  try {
    switch (ctx.action) {
      case "get_balance":
      case "balance.get":
      case "balance":
      case "ping": {
        const res = await fetch(BASE_URL + "/balance", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: await handleHttpError(res, "Stripe"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const available = (data.available || []).map((b: any) => {
          const val = (b.amount / 100).toFixed(2);
          return val + " " + b.currency.toUpperCase();
        });
        const pending = (data.pending || []).map((b: any) => {
          const val = (b.amount / 100).toFixed(2);
          return val + " " + b.currency.toUpperCase();
        });

        let summary = "💳 **Saldo da Conta Stripe** (Modo: " + (data.livemode ? "🟢 Live" : "🟡 Test") + ")\n\n";
        summary += "• **Saldo Disponível**: " + (available.join(", ") || "0.00") + "\n";
        summary += "• **Saldo Pendente**: " + (pending.join(", ") || "0.00") + "\n";

        return {
          success: true,
          connector: "stripe",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_customers":
      case "customers.list":
      case "customers": {
        const limit = Math.min(Number(ctx.params.limit) || 10, 50);
        const res = await fetch(BASE_URL + "/customers?limit=" + limit, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: await handleHttpError(res, "Stripe"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const customers = (data.data || []).map((c: any) => ({
          id: c.id,
          email: c.email || "Sem email",
          name: c.name || "Sem nome",
          currency: (c.currency || "usd").toUpperCase(),
          created: new Date(c.created * 1000).toLocaleDateString("pt-PT"),
        }));

        let summary = "👥 **Clientes no Stripe (" + customers.length + " encontrados)**:\n\n";
        if (customers.length === 0) {
          summary += "Nenhum cliente registado nesta conta Stripe.";
        } else {
          customers.forEach((c: any, idx: number) => {
            summary += (idx + 1) + ". **" + c.name + "** (" + c.email + ") — ID: `" + c.id + "` [Desde: " + c.created + "]\n";
          });
        }

        return {
          success: true,
          connector: "stripe",
          action: ctx.action,
          summary,
          data: customers,
        };
      }

      case "list_charges":
      case "charges.list":
      case "charges":
      case "payments.list": {
        const limit = Math.min(Number(ctx.params.limit) || 10, 50);
        const res = await fetch(BASE_URL + "/charges?limit=" + limit, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: await handleHttpError(res, "Stripe"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const charges = (data.data || []).map((c: any) => ({
          id: c.id,
          amount: (c.amount / 100).toFixed(2) + " " + c.currency.toUpperCase(),
          status: c.status,
          paid: c.paid ? "Sim" : "Não",
          customer: c.customer || "Anónimo",
          receiptUrl: c.receipt_url,
          created: new Date(c.created * 1000).toLocaleString("pt-PT"),
        }));

        let summary = "💰 **Cobranças Recentes no Stripe (" + charges.length + " encontradas)**:\n\n";
        if (charges.length === 0) {
          summary += "Nenhuma cobrança encontrada nesta conta Stripe.";
        } else {
          charges.forEach((c: any, idx: number) => {
            const icon = c.status === "succeeded" ? "✅" : c.status === "pending" ? "⏳" : "❌";
            summary += (idx + 1) + ". " + icon + " **" + c.amount + "** — Status: *" + c.status + "* [ID: `" + c.id + "` | " + c.created + "]\n";
          });
        }

        return {
          success: true,
          connector: "stripe",
          action: ctx.action,
          summary,
          data: charges,
        };
      }

      case "list_invoices":
      case "invoices.list":
      case "invoices": {
        const limit = Math.min(Number(ctx.params.limit) || 10, 50);
        const res = await fetch(BASE_URL + "/invoices?limit=" + limit, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: await handleHttpError(res, "Stripe"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const invoices = (data.data || []).map((inv: any) => ({
          id: inv.id,
          number: inv.number || inv.id,
          customerEmail: inv.customer_email || "N/A",
          amountDue: (inv.amount_due / 100).toFixed(2) + " " + inv.currency.toUpperCase(),
          amountPaid: (inv.amount_paid / 100).toFixed(2) + " " + inv.currency.toUpperCase(),
          status: inv.status,
          hostedUrl: inv.hosted_invoice_url,
        }));

        let summary = "🧾 **Faturas Recentes no Stripe (" + invoices.length + " encontradas)**:\n\n";
        if (invoices.length === 0) {
          summary += "Nenhuma fatura encontrada nesta conta Stripe.";
        } else {
          invoices.forEach((inv: any, idx: number) => {
            summary += (idx + 1) + ". **Fatura " + inv.number + "** (" + inv.customerEmail + ") — Devido: " + inv.amountDue + " [Status: *" + inv.status + "*]\n";
          });
        }

        return {
          success: true,
          connector: "stripe",
          action: ctx.action,
          summary,
          data: invoices,
        };
      }

      case "get_payment_intent":
      case "payment_intents.get":
      case "payment_intent.get": {
        const piId = String(ctx.params.payment_intent_id || ctx.params.id || "").trim();
        if (!piId) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `payment_intent_id` (ex: `pi_3M...`).",
            error: "id ausente",
          };
        }

        const res = await fetch(BASE_URL + "/payment_intents/" + encodeURIComponent(piId), { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "stripe",
            action: ctx.action,
            summary: await handleHttpError(res, "Stripe"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const amount = (data.amount / 100).toFixed(2) + " " + data.currency.toUpperCase();
        let summary = "💳 **Detalhes do Payment Intent (`" + data.id + "`)**:\n\n";
        summary += "• **Valor**: " + amount + "\n";
        summary += "• **Status**: *" + data.status + "*\n";
        summary += "• **Cliente**: " + (data.customer || "Nenhum") + "\n";
        summary += "• **Modo**: " + (data.livemode ? "Produção (Live)" : "Teste (Sandbox)") + "\n";

        return {
          success: true,
          connector: "stripe",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "stripe",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Stripe: '`" + ctx.action + "`'. Ações suportadas: `get_balance`, `list_customers`, `list_charges`, `list_invoices`, `get_payment_intent`.",
          error: "Ação não suportada",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "stripe",
      action: ctx.action,
      summary: "❌ **Erro ao conectar ao Stripe**: " + (err.message || String(err)),
      error: String(err),
    };
  }
}

// ==========================================
// 2. CONECTOR GOOGLE SHEETS (Folhas de Cálculo)
// ==========================================
function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}

export async function executeGoogleSheets(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "google_sheets",
      action: ctx.action,
      summary: "⚠️ **Google Sheets Não Conectado**: Insere o teu Google OAuth Access Token em Definições → Plugins → Google Sheets.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
  const headers = {
    Authorization: "Bearer " + cred,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    switch (ctx.action) {
      case "get_spreadsheet":
      case "spreadsheets.get":
      case "spreadsheet.get":
      case "info":
      case "get": {
        const rawId = String(ctx.params.spreadsheet_id || ctx.params.id || "").trim();
        if (!rawId) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `spreadsheet_id` ou o link da folha de cálculo.",
            error: "spreadsheet_id ausente",
          };
        }

        const sheetId = extractSpreadsheetId(rawId);
        const res = await fetch(BASE_URL + "/" + encodeURIComponent(sheetId) + "?includeGridData=false", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Sheets"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const sheets = (data.sheets || []).map((s: any) => ({
          title: s.properties?.title || "Sem título",
          sheetId: s.properties?.sheetId,
          rowCount: s.properties?.gridProperties?.rowCount,
          columnCount: s.properties?.gridProperties?.columnCount,
        }));

        let summary = "📊 **Folha de Cálculo**: **" + (data.properties?.title || "Sem Título") + "**\n\n";
        summary += "• **ID**: `" + data.spreadsheetId + "`\n";
        summary += "• **Fuso / Locale**: " + (data.properties?.locale || "en") + " | " + (data.properties?.timeZone || "UTC") + "\n";
        summary += "• **Páginas / Abas (" + sheets.length + ")**:\n";
        sheets.forEach((s: any, idx: number) => {
          summary += "  " + (idx + 1) + ". **" + s.title + "** (" + s.rowCount + " linhas × " + s.columnCount + " colunas)\n";
        });

        return {
          success: true,
          connector: "google_sheets",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_values":
      case "values.get":
      case "read":
      case "read_values": {
        const rawId = String(ctx.params.spreadsheet_id || ctx.params.id || "").trim();
        if (!rawId) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `spreadsheet_id` para consultar dados.",
            error: "spreadsheet_id ausente",
          };
        }

        const sheetId = extractSpreadsheetId(rawId);
        const range = String(ctx.params.range || "A1:Z50").trim();
        const res = await fetch(BASE_URL + "/" + encodeURIComponent(sheetId) + "/values/" + encodeURIComponent(range), { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Sheets"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const rows: any[][] = data.values || [];
        let summary = "📊 **Dados da Planilha** (Intervalo: `" + (data.range || range) + "` | " + rows.length + " linhas)\n\n";
        if (rows.length === 0) {
          summary += "O intervalo especificado não contém registos.";
        } else {
          // Renderização em tabela markdown compacta
          const maxRows = Math.min(rows.length, 12);
          for (let i = 0; i < maxRows; i++) {
            const rowStr = rows[i].map((c) => String(c ?? "")).join(" | ");
            summary += "| " + rowStr + " |\n";
            if (i === 0) {
              summary += "| " + rows[i].map(() => "---").join(" | ") + " |\n";
            }
          }
          if (rows.length > 12) {
            summary += "\n*... e mais " + (rows.length - 12) + " linhas.*";
          }
        }

        return {
          success: true,
          connector: "google_sheets",
          action: ctx.action,
          summary,
          data: rows,
        };
      }

      case "append_values":
      case "values.append":
      case "append":
      case "insert": {
        const rawId = String(ctx.params.spreadsheet_id || ctx.params.id || "").trim();
        if (!rawId) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `spreadsheet_id` da folha de cálculo.",
            error: "spreadsheet_id ausente",
          };
        }

        const sheetId = extractSpreadsheetId(rawId);
        const range = String(ctx.params.range || "A1").trim();
        let valuesToAppend: any[][] = [];

        if (Array.isArray(ctx.params.values)) {
          valuesToAppend = ctx.params.values.every((v) => Array.isArray(v))
            ? (ctx.params.values as any[][])
            : [ctx.params.values as any[]];
        } else if (typeof ctx.params.values === "string") {
          valuesToAppend = [ctx.params.values.split(",").map((s) => s.trim())];
        } else if (ctx.params.row) {
          valuesToAppend = [Array.isArray(ctx.params.row) ? ctx.params.row : [ctx.params.row]];
        } else {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: '⚠️ **Parâmetro em falta**: Fornece os valores para inserção em `values` (ex: [["Ana", 25, "Developer"]]).',
            error: "values ausente",
          };
        }

        const res = await fetch(
          BASE_URL + "/" + encodeURIComponent(sheetId) + "/values/" + encodeURIComponent(range) + ":append?valueInputOption=USER_ENTERED",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ values: valuesToAppend }),
          }
        );

        if (!res.ok) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Sheets"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        return {
          success: true,
          connector: "google_sheets",
          action: ctx.action,
          summary: "✅ **Linhas adicionadas com sucesso à folha de cálculo!**\n• Atualizado: `" + (data.updates?.updatedRange || range) + "` (" + (data.updates?.updatedRows || valuesToAppend.length) + " linhas inseridas)",
          data,
        };
      }

      case "create_spreadsheet":
      case "spreadsheets.create":
      case "create": {
        const title = String(ctx.params.title || "Nova Planilha GRIOT").trim();
        const res = await fetch(BASE_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            properties: { title },
          }),
        });

        if (!res.ok) {
          return {
            success: false,
            connector: "google_sheets",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Sheets"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        return {
          success: true,
          connector: "google_sheets",
          action: ctx.action,
          summary: "✨ **Nova folha de cálculo criada!**\n• **Título**: " + data.properties?.title + "\n• **ID**: `" + data.spreadsheetId + "`\n• **Link**: " + data.spreadsheetUrl,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "google_sheets",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Google Sheets: '`" + ctx.action + "`'. Ações suportadas: `get_spreadsheet`, `get_values`, `append_values`, `create_spreadsheet`.",
          error: "Ação não suportada",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "google_sheets",
      action: ctx.action,
      summary: "❌ **Erro ao conectar ao Google Sheets**: " + (err.message || String(err)),
      error: String(err),
    };
  }
}

// ==========================================
// 3. CONECTOR GOOGLE DRIVE (Armazenamento Cloud)
// ==========================================
export async function executeGoogleDrive(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "google_drive",
      action: ctx.action,
      summary: "⚠️ **Google Drive Não Conectado**: Insere o teu Google OAuth Access Token em Definições → Plugins → Google Drive.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://www.googleapis.com/drive/v3";
  const headers = {
    Authorization: "Bearer " + cred,
    Accept: "application/json",
  };

  try {
    switch (ctx.action) {
      case "list_files":
      case "files.list":
      case "files": {
        const limit = Math.min(Number(ctx.params.limit) || 15, 50);
        const url = BASE_URL + "/files?pageSize=" + limit + "&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)&q=trashed%3Dfalse";
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Drive"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const files = (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          sizeMb: f.size ? (Number(f.size) / (1024 * 1024)).toFixed(2) + " MB" : "N/A",
          modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("pt-PT") : "N/A",
          webViewLink: f.webViewLink,
        }));

        let summary = "📁 **Ficheiros no Google Drive (" + files.length + " encontrados)**:\n\n";
        if (files.length === 0) {
          summary += "Nenhum ficheiro recente encontrado no Google Drive.";
        } else {
          files.forEach((f: any, idx: number) => {
            const isFolder = f.mimeType === "application/vnd.google-apps.folder";
            const icon = isFolder ? "📁" : "📄";
            summary += (idx + 1) + ". " + icon + " **" + f.name + "** (" + f.sizeMb + ") [ID: `" + f.id + "` | " + f.modified + "]\n";
          });
        }

        return {
          success: true,
          connector: "google_drive",
          action: ctx.action,
          summary,
          data: files,
        };
      }

      case "search_files":
      case "files.search":
      case "search": {
        const queryTerm = String(ctx.params.query || ctx.params.text || "").trim();
        if (!queryTerm) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o termo de pesquisa em `query` ou `text`.",
            error: "query ausente",
          };
        }

        const limit = Math.min(Number(ctx.params.limit) || 10, 50);
        const q = "name contains '" + queryTerm.replace(/'/g, "\\'") + "' and trashed = false";
        const url = BASE_URL + "/files?pageSize=" + limit + "&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&q=" + encodeURIComponent(q);
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Drive"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const files = (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: f.webViewLink,
        }));

        let summary = "🔍 **Resultados da Pesquisa no Drive por '" + queryTerm + "' (" + files.length + ")**:\n\n";
        if (files.length === 0) {
          summary += "Nenhum ficheiro correspondente à pesquisa.";
        } else {
          files.forEach((f: any, idx: number) => {
            summary += (idx + 1) + ". **" + f.name + "** [ID: `" + f.id + "`]\n";
          });
        }

        return {
          success: true,
          connector: "google_drive",
          action: ctx.action,
          summary,
          data: files,
        };
      }

      case "get_file_metadata":
      case "files.get":
      case "file.get": {
        const fileId = String(ctx.params.file_id || ctx.params.id || "").trim();
        if (!fileId) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `file_id` para consultar os metadados.",
            error: "file_id ausente",
          };
        }

        const url = BASE_URL + "/files/" + encodeURIComponent(fileId) + "?fields=id,name,mimeType,size,createdTime,modifiedTime,owners,webViewLink,webContentLink,parents";
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Drive"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "📄 **Metadados do Ficheiro (" + data.name + ")**:\n\n";
        summary += "• **ID**: `" + data.id + "`\n";
        summary += "• **Tipo MIME**: `" + data.mimeType + "`\n";
        if (data.size) {
          summary += "• **Tamanho**: " + (Number(data.size) / (1024 * 1024)).toFixed(2) + " MB\n";
        }
        summary += "• **Criado em**: " + (data.createdTime ? new Date(data.createdTime).toLocaleString("pt-PT") : "N/A") + "\n";
        summary += "• **Modificado em**: " + (data.modifiedTime ? new Date(data.modifiedTime).toLocaleString("pt-PT") : "N/A") + "\n";
        if (data.webViewLink) {
          summary += "• **Link no Drive**: " + data.webViewLink + "\n";
        }

        return {
          success: true,
          connector: "google_drive",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_about":
      case "about":
      case "user":
      case "profile":
      case "quota": {
        const res = await fetch(BASE_URL + "/about?fields=user,storageQuota", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "google_drive",
            action: ctx.action,
            summary: await handleHttpError(res, "Google Drive"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const user = data.user || {};
        const quota = data.storageQuota || {};
        const usedGb = quota.usage ? (Number(quota.usage) / (1024 * 1024 * 1024)).toFixed(2) : "0";
        const limitGb = quota.limit ? (Number(quota.limit) / (1024 * 1024 * 1024)).toFixed(2) : "Ilimitado";

        let summary = "☁️ **Informações da Conta Google Drive**:\n\n";
        summary += "• **Utilizador**: " + (user.displayName || "Sem nome") + " (" + (user.emailAddress || "N/A") + ")\n";
        summary += "• **Armazenamento**: " + usedGb + " GB usados de " + limitGb + " GB\n";

        return {
          success: true,
          connector: "google_drive",
          action: ctx.action,
          summary,
          data,
        };
      }

      default:
        return {
          success: false,
          connector: "google_drive",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Google Drive: '`" + ctx.action + "`'. Ações suportadas: `list_files`, `search_files`, `get_file_metadata`, `get_about`.",
          error: "Ação não suportada",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "google_drive",
      action: ctx.action,
      summary: "❌ **Erro ao conectar ao Google Drive**: " + (err.message || String(err)),
      error: String(err),
    };
  }
}

// ==========================================
// 4. CONECTOR FIGMA (Design & UI Specs)
// ==========================================
function extractFigmaFileKey(input: string): string {
  const match = input.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (match) return match[1];
  return input.trim();
}

export async function executeFigma(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  if (!cred) {
    return {
      success: false,
      connector: "figma",
      action: ctx.action,
      summary: "⚠️ **Figma Não Conectado**: Insere o teu Personal Access Token (figd_...) em Definições → Plugins → Figma.",
      error: "Credencial ausente",
    };
  }

  const BASE_URL = "https://api.figma.com/v1";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Se o token começar por figd_ ou for PAT, usa o cabeçalho X-Figma-Token
  if (cred.startsWith("figd_") || !cred.startsWith("Bearer ")) {
    headers["X-Figma-Token"] = cred;
  } else {
    headers["Authorization"] = cred;
  }

  try {
    switch (ctx.action) {
      case "get_file":
      case "files.get":
      case "file.get":
      case "file": {
        const rawKey = String(ctx.params.file_key || ctx.params.key || ctx.params.id || "").trim();
        if (!rawKey) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `file_key` ou URL do ficheiro Figma.",
            error: "file_key ausente",
          };
        }

        const fileKey = extractFigmaFileKey(rawKey);
        const depth = Number(ctx.params.depth) || 2;
        const res = await fetch(BASE_URL + "/files/" + encodeURIComponent(fileKey) + "?depth=" + depth, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: await handleHttpError(res, "Figma"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const pages = (data.document?.children || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          frameCount: (p.children || []).length,
        }));

        let summary = "🎨 **Ficheiro Figma**: **" + (data.name || "Sem Nome") + "**\n\n";
        summary += "• **Última Modificação**: " + (data.lastModified ? new Date(data.lastModified).toLocaleString("pt-PT") : "N/A") + "\n";
        summary += "• **Versão**: " + (data.version || "1.0") + "\n";
        summary += "• **Páginas (" + pages.length + ")**:\n";
        pages.forEach((p: any, idx: number) => {
          summary += "  " + (idx + 1) + ". **" + p.name + "** (" + p.frameCount + " frames principais) [ID: `" + p.id + "`]\n";
        });

        return {
          success: true,
          connector: "figma",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_file_nodes":
      case "nodes.get":
      case "nodes": {
        const rawKey = String(ctx.params.file_key || ctx.params.key || "").trim();
        const rawIds = String(ctx.params.node_ids || ctx.params.ids || "").trim();
        if (!rawKey || !rawIds) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica o `file_key` e os `node_ids` (ex: `0:1,1:2`).",
            error: "file_key ou node_ids ausente",
          };
        }

        const fileKey = extractFigmaFileKey(rawKey);
        const res = await fetch(BASE_URL + "/files/" + encodeURIComponent(fileKey) + "/nodes?ids=" + encodeURIComponent(rawIds), { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: await handleHttpError(res, "Figma"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const nodes = Object.entries(data.nodes || {}).map(([id, n]: [string, any]) => ({
          id,
          name: n.document?.name,
          type: n.document?.type,
        }));

        let summary = "🔍 **Nós Inspecionados no Figma (" + nodes.length + ")**:\n\n";
        nodes.forEach((n, idx) => {
          summary += (idx + 1) + ". **" + n.name + "** (`" + n.type + "`) — ID: `" + n.id + "`\n";
        });

        return {
          success: true,
          connector: "figma",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "get_images":
      case "images.get":
      case "images":
      case "render": {
        const rawKey = String(ctx.params.file_key || ctx.params.key || "").trim();
        const rawIds = String(ctx.params.node_ids || ctx.params.ids || "").trim();
        if (!rawKey || !rawIds) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: "⚠️ **Parâmetros em falta**: Especifica o `file_key` e os `node_ids` para renderizar imagens.",
            error: "file_key ou node_ids ausente",
          };
        }

        const fileKey = extractFigmaFileKey(rawKey);
        const format = String(ctx.params.format || "png").toLowerCase();
        const res = await fetch(BASE_URL + "/images/" + encodeURIComponent(fileKey) + "?ids=" + encodeURIComponent(rawIds) + "&format=" + format, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: await handleHttpError(res, "Figma"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const images = data.images || {};
        let summary = "🖼️ **Imagens Renderizadas do Figma** (Formato: `" + format + "`):\n\n";
        Object.entries(images).forEach(([nodeId, url]) => {
          summary += "• **Nó " + nodeId + "**: " + url + "\n";
        });

        return {
          success: true,
          connector: "figma",
          action: ctx.action,
          summary,
          data: images,
        };
      }

      case "get_comments":
      case "comments.get":
      case "comments": {
        const rawKey = String(ctx.params.file_key || ctx.params.key || "").trim();
        if (!rawKey) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `file_key` para consultar comentários.",
            error: "file_key ausente",
          };
        }

        const fileKey = extractFigmaFileKey(rawKey);
        const res = await fetch(BASE_URL + "/files/" + encodeURIComponent(fileKey) + "/comments", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "figma",
            action: ctx.action,
            summary: await handleHttpError(res, "Figma"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const comments = (data.comments || []).map((c: any) => ({
          id: c.id,
          message: c.message,
          user: c.user?.handle || "Utilizador",
          created: new Date(c.created_at).toLocaleDateString("pt-PT"),
        }));

        let summary = "💬 **Comentários no Figma (" + comments.length + ")**:\n\n";
        if (comments.length === 0) {
          summary += "Nenhum comentário neste ficheiro Figma.";
        } else {
          comments.slice(0, 10).forEach((c: any, idx: number) => {
            summary += (idx + 1) + ". **" + c.user + "**: \"" + c.message + "\" [ID: `" + c.id + "` | " + c.created + "]\n";
          });
        }

        return {
          success: true,
          connector: "figma",
          action: ctx.action,
          summary,
          data: comments,
        };
      }

      default:
        return {
          success: false,
          connector: "figma",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Figma: '`" + ctx.action + "`'. Ações suportadas: `get_file`, `get_file_nodes`, `get_images`, `get_comments`.",
          error: "Ação não suportada",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "figma",
      action: ctx.action,
      summary: "❌ **Erro ao conectar ao Figma**: " + (err.message || String(err)),
      error: String(err),
    };
  }
}

// ==========================================
// 5. CONECTOR DOCKER HUB (DevOps & Imagens)
// ==========================================
export async function executeDocker(ctx: ConnectorExecutionContext): Promise<ConnectorExecutionResponse> {
  const cred = (ctx.credential || "").trim();
  const BASE_URL = "https://hub.docker.com/v2";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (cred) {
    if (cred.startsWith("dckr_pat_") || !cred.includes(":")) {
      headers["Authorization"] = "Bearer " + cred;
    } else {
      headers["Authorization"] = "Basic " + btoa(cred);
    }
  }

  try {
    switch (ctx.action) {
      case "get_user":
      case "users.get":
      case "user.get":
      case "profile":
      case "me":
      case "user": {
        const username = String(ctx.params.username || ctx.accountName || "").trim();
        const endpoint = username ? BASE_URL + "/users/" + encodeURIComponent(username) : BASE_URL + "/user";

        const res = await fetch(endpoint, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: await handleHttpError(res, "Docker Hub"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🐳 **Perfil Docker Hub (" + (data.username || username) + ")**:\n\n";
        summary += "• **Nome Completo**: " + (data.full_name || "N/A") + "\n";
        summary += "• **Tipo de Conta**: " + (data.type || "individual") + "\n";
        summary += "• **Localização**: " + (data.location || "N/A") + "\n";
        summary += "• **Membro desde**: " + (data.date_joined ? new Date(data.date_joined).toLocaleDateString("pt-PT") : "N/A") + "\n";

        return {
          success: true,
          connector: "docker",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_repositories":
      case "repositories.list":
      case "repos.list":
      case "repos":
      case "repositories": {
        const namespace = String(ctx.params.namespace || ctx.params.user || ctx.accountName || "library").trim();
        const limit = Math.min(Number(ctx.params.limit) || 15, 50);
        const res = await fetch(BASE_URL + "/repositories/" + encodeURIComponent(namespace) + "/?page_size=" + limit, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: await handleHttpError(res, "Docker Hub"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const repos = (data.results || []).map((r: any) => ({
          name: r.name,
          namespace: r.namespace,
          stars: r.star_count || 0,
          pulls: r.pull_count || 0,
          isPrivate: r.is_private,
          lastUpdated: r.last_updated ? new Date(r.last_updated).toLocaleDateString("pt-PT") : "N/A",
        }));

        let summary = "🐳 **Repositórios de Imagens Docker (" + namespace + ")**:\n\n";
        if (repos.length === 0) {
          summary += "Nenhum repositório de imagens encontrado em `" + namespace + "`.";
        } else {
          repos.forEach((r: any, idx: number) => {
            const privIcon = r.isPrivate ? "🔒" : "🌐";
            summary += (idx + 1) + ". " + privIcon + " **" + r.namespace + "/" + r.name + "** — ⭐ " + r.stars + " | 📥 " + r.pulls + " pulls [Atualizado: " + r.lastUpdated + "]\n";
          });
        }

        return {
          success: true,
          connector: "docker",
          action: ctx.action,
          summary,
          data: repos,
        };
      }

      case "get_repository":
      case "repositories.get":
      case "repo.get":
      case "repo": {
        const repoParam = String(ctx.params.repository || ctx.params.name || ctx.params.repo || "").trim();
        if (!repoParam) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `repository` (ex: `redis` ou `meu_user/minha_app`).",
            error: "repository ausente",
          };
        }

        let namespace = "library";
        let repository = repoParam;
        if (repoParam.includes("/")) {
          const parts = repoParam.split("/");
          namespace = parts[0];
          repository = parts[1];
        } else if (ctx.params.namespace) {
          namespace = String(ctx.params.namespace);
        }

        const res = await fetch(BASE_URL + "/repositories/" + encodeURIComponent(namespace) + "/" + encodeURIComponent(repository) + "/", { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: await handleHttpError(res, "Docker Hub"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        let summary = "🐳 **Imagem Docker: " + data.namespace + "/" + data.name + "**\n\n";
        summary += "• **Descrição**: " + (data.description || "Sem descrição.") + "\n";
        summary += "• **Visibilidade**: " + (data.is_private ? "Privada 🔒" : "Pública 🌐") + "\n";
        summary += "• **Estatísticas**: ⭐ " + (data.star_count || 0) + " estrelas | 📥 " + (data.pull_count || 0) + " downloads\n";
        summary += "• **Última Atualização**: " + (data.last_updated ? new Date(data.last_updated).toLocaleString("pt-PT") : "N/A") + "\n";

        return {
          success: true,
          connector: "docker",
          action: ctx.action,
          summary,
          data,
        };
      }

      case "list_tags":
      case "tags.list":
      case "tags": {
        const repoParam = String(ctx.params.repository || ctx.params.name || ctx.params.repo || "").trim();
        if (!repoParam) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: "⚠️ **Parâmetro em falta**: Especifica o `repository` para listar tags (ex: `nginx` ou `usuario/app`).",
            error: "repository ausente",
          };
        }

        let namespace = "library";
        let repository = repoParam;
        if (repoParam.includes("/")) {
          const parts = repoParam.split("/");
          namespace = parts[0];
          repository = parts[1];
        } else if (ctx.params.namespace) {
          namespace = String(ctx.params.namespace);
        }

        const limit = Math.min(Number(ctx.params.limit) || 10, 50);
        const res = await fetch(BASE_URL + "/repositories/" + encodeURIComponent(namespace) + "/" + encodeURIComponent(repository) + "/tags/?page_size=" + limit, { headers });
        if (!res.ok) {
          return {
            success: false,
            connector: "docker",
            action: ctx.action,
            summary: await handleHttpError(res, "Docker Hub"),
            error: res.statusText,
          };
        }

        const data = await res.json();
        const tags = (data.results || []).map((t: any) => {
          const sizeMb = t.full_size ? (Number(t.full_size) / (1024 * 1024)).toFixed(1) + " MB" : "N/A";
          const archs = (t.images || []).map((img: any) => img.architecture).filter(Boolean);
          return {
            name: t.name,
            size: sizeMb,
            architectures: Array.from(new Set(archs)).join(", ") || "amd64",
            lastPushed: t.tag_last_pushed ? new Date(t.tag_last_pushed).toLocaleDateString("pt-PT") : "N/A",
            digest: t.digest ? t.digest.slice(0, 19) + "..." : "N/A",
          };
        });

        let summary = "🏷️ **Tags da Imagem Docker: " + namespace + "/" + repository + " (" + tags.length + ")**:\n\n";
        if (tags.length === 0) {
          summary += "Nenhuma tag encontrada para esta imagem.";
        } else {
          tags.forEach((t: any, idx: number) => {
            summary += (idx + 1) + ". **:" + t.name + "** (" + t.size + ") — Arq: [" + t.architectures + "] | Push: " + t.lastPushed + "\n";
          });
        }

        return {
          success: true,
          connector: "docker",
          action: ctx.action,
          summary,
          data: tags,
        };
      }

      default:
        return {
          success: false,
          connector: "docker",
          action: ctx.action,
          summary: "⚠️ Ação desconhecida para Docker Hub: '`" + ctx.action + "`'. Ações suportadas: `get_user`, `list_repositories`, `get_repository`, `list_tags`.",
          error: "Ação não suportada",
        };
    }
  } catch (err: any) {
    return {
      success: false,
      connector: "docker",
      action: ctx.action,
      summary: "❌ **Erro ao conectar ao Docker Hub**: " + (err.message || String(err)),
      error: String(err),
    };
  }
}

// ==========================================
// DISPATCHER PRINCIPAL DO LOTE 4
// ==========================================
export async function executeBatch4Connector(
  connectorId: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorExecutionResponse> {
  const normId = connectorId.toLowerCase().trim();

  switch (normId) {
    case "stripe":
      return executeStripe(ctx);
    case "google_sheets":
    case "sheets":
    case "googlesheets":
      return executeGoogleSheets(ctx);
    case "google_drive":
    case "gdrive":
    case "googledrive":
      return executeGoogleDrive(ctx);
    case "figma":
      return executeFigma(ctx);
    case "docker":
    case "dockerhub":
    case "docker_hub":
      return executeDocker(ctx);
    default:
      return {
        success: false,
        connector: connectorId,
        action: ctx.action,
        summary: "⚠️ Conector '`" + connectorId + "`' não reconhecido no Lote 4.",
        error: "Conector desconhecido",
      };
  }
}
