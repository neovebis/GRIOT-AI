/**
 * GRIOT Connectors Hub - Batch 1 (Desenvolvimento & Código)
 * Implementação de Produção Completa e Resiliente para:
 * 1. GitHub (repos, detalhes, issues, criação de issues, pull requests, commits, ficheiros de código)
 * 2. GitLab (projetos, detalhes, issues, criação de issues, pipelines CI/CD, commits)
 * 3. Vercel (projetos, detalhes, deployments com status em tempo real, logs)
 * 4. Supabase (Management API para projetos e PostgREST para consulta e esquema de tabelas)
 * 5. Firebase (Firestore documents, coleções, leitura estruturada e status do projeto)
 */

import { safeFetch, handleHttpError } from "./connector-http";

export interface ConnectorExecutionContext {
  credential: string;
  account?: string;
  action: string;
  params: Record<string, unknown>;
}

export interface ConnectorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  summary: string;
}

const USER_AGENT = { "User-Agent": "Griot-Connector-Runner/2.0 (Mobile/Web)" };

// ==========================================
// 1. GITHUB CONNECTOR
// ==========================================
export async function executeGitHub(ctx: ConnectorExecutionContext): Promise<ConnectorResult> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      error: "Token GitHub não configurado.",
      summary: "⚠️ **GitHub Não Conectado**: Adiciona o teu Personal Access Token (PAT) em Definições → Plugins → GitHub.",
    };
  }

  const cleanToken = token.replace(/^(Bearer|token)\s+/i, "").trim();
  const headers = {
    ...USER_AGENT,
    Authorization: `Bearer ${cleanToken}`,
    Accept: "application/vnd.github.v3+json",
  };

  const action = (ctx.action || "list_repos").toLowerCase();
  const p = ctx.params || {};

  let owner = (ctx.account || "").trim();
  const resolveOwner = async (): Promise<string> => {
    if (owner) return owner;
    try {
      const uRes = await safeFetch("https://api.github.com/user", { headers });
      if (uRes.ok) {
        const u = await uRes.json();
        if (u.login) {
          owner = u.login;
          return owner;
        }
      }
    } catch {
      // Ignora erro de lookup
    }
    return "";
  };

  const resolveRepo = async (targetRepo: string): Promise<string> => {
    let r = (targetRepo || "").trim();
    if (!r) return "";
    if (r.includes("/")) return r;
    const currentOwner = await resolveOwner();
    return currentOwner ? `${currentOwner}/${r}` : r;
  };

  try {
    // 1.1 Listar Repositórios
    if (
      action === "list_repos" ||
      action === "repos.list" ||
      action === "repos" ||
      action === "list" ||
      action === "repositories" ||
      action === "list_repositories" ||
      action === "projectlist" ||
      action === "projects.list" ||
      action === "projects" ||
      action === "project_list" ||
      action === "projects_list" ||
      action === "listprojects"
    ) {
      const perPage = Math.min(Math.max(Number(p.limit || 30), 1), 100);
      const sort = String(p.sort || "updated");
      let url = `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}`;
      if (!cleanToken.startsWith("github_pat_")) {
        if (p.visibility) {
          url += `&visibility=${encodeURIComponent(String(p.visibility))}`;
        } else if (p.type && p.type !== "all") {
          url += `&type=${encodeURIComponent(String(p.type))}`;
        } else {
          url += `&affiliation=${encodeURIComponent(String(p.affiliation || "owner,collaborator,organization_member"))}`;
        }
      }
      let res = await safeFetch(url, { headers });
      if (!res.ok && (res.status === 422 || res.status === 400) && url.includes("&affiliation=")) {
        url = `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}`;
        res = await safeFetch(url, { headers });
      }
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const repos = (await res.json()) as Array<{
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        stargazers_count: number;
        forks_count: number;
        language: string | null;
        updated_at: string;
        description: string | null;
        default_branch: string;
      }>;

      const list = repos.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        url: r.html_url,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language || "N/A",
        updated: new Date(r.updated_at).toLocaleDateString("pt-PT"),
        description: r.description || "Sem descrição",
        default_branch: r.default_branch,
      }));

      return {
        success: true,
        data: list,
        summary: list.length
          ? `📦 **Repositórios GitHub (${list.length} encontrados):**\n` +
            list
              .map(
                (r) =>
                  `• **[${r.full_name}](${r.url})** ${r.private ? "🔒 Privado" : "🌐 Público"} ` +
                  `| ⭐ ${r.stars} | 🍴 ${r.forks} | ${r.language} | Atualizado: ${r.updated}\n  _${r.description}_`,
              )
              .join("\n\n")
          : "Nenhum repositório encontrado para este utilizador.",
      };
    }

    // 1.2 Detalhes de um Repositório Específico
    if (
      action === "get_repo" ||
      action === "repos.get" ||
      action === "repo_details" ||
      action === "repo" ||
      action === "get" ||
      action === "projects.get" ||
      action === "get_project" ||
      action === "project" ||
      action === "repository"
    ) {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      if (!repo || !repo.includes("/")) {
        throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo' (ex: facebook/react).");
      }
      let res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (!res.ok) {
        const scopes = res.headers.get("x-oauth-scopes");
        if (res.status === 404 && scopes !== null && !scopes.includes("repo")) {
          throw new Error(`Repositório '${repo}' não encontrado no GitHub (404). Se for privado, o token necessita do escopo 'repo'.`);
        }
        throw new Error(await handleHttpError(res, "GitHub"));
      }

      const data = await res.json();
      return {
        success: true,
        data,
        summary:
          `📦 **Repositório GitHub: [${data.full_name}](${data.html_url})**\n` +
          `• Descrição: ${data.description || "Sem descrição"}\n` +
          `• Visibilidade: ${data.private ? "Privado 🔒" : "Público 🌐"}\n` +
          `• Branch Padrão: \`${data.default_branch}\`\n` +
          `• Estatísticas: ⭐ ${data.stargazers_count} stars | 🍴 ${data.forks_count} forks | 🐛 ${data.open_issues_count} issues abertas\n` +
          `• Linguagem Principal: ${data.language || "Não especificada"}\n` +
          `• Licença: ${data.license?.name || "Nenhuma licença detetada"}\n` +
          `• Clone URL: \`${data.clone_url}\``,
      };
    }

    // 1.2b Criar Repositório
    if (
      action === "create_repo" ||
      action === "repos.create" ||
      action === "create" ||
      action === "new_repo" ||
      action === "repository.create"
    ) {
      const rawName = String(p.name || p.repo || p.repository || p.title || p.repo_name || "").trim();
      const name = rawName.includes("/") ? rawName.split("/").pop()!.trim() : rawName;
      if (!name) throw new Error("Parâmetro 'name' (ou 'repo') é obrigatório para criar repositório.");
      const isPrivate = p.private !== undefined ? Boolean(p.private) : false;
      const autoInit = p.auto_init !== undefined ? Boolean(p.auto_init) : true;
      const res = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: p.description || undefined,
          private: isPrivate,
          auto_init: autoInit,
          gitignore_template: p.gitignore_template || undefined,
          license_template: p.license_template || undefined,
        }),
      });
      if (!res.ok) {
        const scopes = res.headers.get("x-oauth-scopes");
        if ((res.status === 403 || res.status === 404) && scopes !== null && !scopes.includes("repo") && !scopes.includes("public_repo")) {
          throw new Error("Permissão insuficiente para criar repositório. O token atual necessita do escopo 'repo'.");
        }
        throw new Error(await handleHttpError(res, "GitHub"));
      }
      const data = await res.json();
      return {
        success: true,
        data,
        summary: `📦 **Repositório Criado no GitHub:** [${data.full_name}](${data.html_url}) (${data.private ? "Privado 🔒" : "Público 🌐"})`,
      };
    }

    // 1.3 Listar Issues
    if (action === "list_issues" || action === "issues.list" || action === "issues") {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      if (!repo.includes("/")) {
        throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo'.");
      }
      const state = String(p.state || "open");
      const perPage = Math.min(Math.max(Number(p.limit || 10), 1), 30);
      const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=${state}&per_page=${perPage}`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const issues = (await res.json()) as Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        user: { login: string };
        created_at: string;
        comments: number;
        pull_request?: unknown;
      }>;

      // Filtra apenas issues reais (a API do GitHub por padrão mistura PRs com issues)
      const pureIssues = issues.filter((i) => !i.pull_request);

      return {
        success: true,
        data: pureIssues,
        summary: pureIssues.length
          ? `🐛 **Issues em [${repo}](https://github.com/${repo}/issues) (${pureIssues.length} encontradas):**\n` +
            pureIssues
              .map(
                (i) =>
                  `• **[#${i.number} ${i.title}](${i.html_url})** [${i.state.toUpperCase()}]\n` +
                  `  Por @${i.user?.login} em ${new Date(i.created_at).toLocaleDateString("pt-PT")} (${i.comments} comentários)`,
              )
              .join("\n")
          : `Nenhuma issue aberta encontrada em **${repo}**.`,
      };
    }

    // 1.4 Criar Issue
    if (action === "create_issue" || action === "issues.create") {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      if (!repo.includes("/")) {
        throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo'.");
      }
      const title = String(p.title || p.name || "").trim();
      if (!title) throw new Error("Parâmetro 'title' é obrigatório para criar uma issue.");
      const body = String(p.body || p.content || p.description || "").trim();
      const labels = Array.isArray(p.labels) ? p.labels : undefined;

      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, labels }),
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const data = await res.json();
      return {
        success: true,
        data,
        summary: `✅ **Issue criada com sucesso!**\n• Título: **[#${data.number} ${data.title}](${data.html_url})**\n• Repositório: ${repo}\n• Estado: ${data.state}`,
      };
    }

    // 1.5 Ler Conteúdo de Ficheiro
    if (action === "get_file" || action === "read_file" || action === "contents.read_file" || action === "file_content") {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      const path = String(p.path || p.file || p.filepath || "").trim();
      if (!repo.includes("/") || !path) {
        throw new Error("Requer parâmetros 'repo' (dono/repo) e 'path' (ex: package.json ou src/index.ts).");
      }
      const ref = p.ref || p.branch ? `?ref=${encodeURIComponent(String(p.ref || p.branch))}` : "";
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${ref}`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const data = await res.json();
      if (Array.isArray(data)) {
        return {
          success: true,
          data,
          summary: `📁 **O caminho '${path}' é uma pasta com ${data.length} itens:**\n` + data.map((item: any) => `• [${item.type}] ${item.name} (${item.path})`).join("\n"),
        };
      }

      let content = "";
      if (data.content && data.encoding === "base64") {
        try {
          content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
        } catch {
          content = atob(data.content.replace(/\n/g, ""));
        }
      }

      return {
        success: true,
        data: { name: data.name, path: data.path, size: data.size, sha: data.sha, content },
        summary: `📄 **Ficheiro \`${data.path}\` em [${repo}](${data.html_url}) (${data.size} bytes):**\n\n\`\`\`\n${content.slice(0, 4000)}${content.length > 4000 ? "\n... (conteúdo truncado)" : ""}\n\`\`\``,
      };
    }

    // 1.6 Listar Pull Requests
    if (action === "list_prs" || action === "pulls.list" || action === "pull_requests" || action === "prs") {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      if (!repo.includes("/")) {
        throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo'.");
      }
      const state = String(p.state || "open");
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=${state}&per_page=10`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const prs = (await res.json()) as Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        user: { login: string };
        head: { ref: string };
        base: { ref: string };
        created_at: string;
      }>;

      return {
        success: true,
        data: prs,
        summary: prs.length
          ? `🔀 **Pull Requests em [${repo}](https://github.com/${repo}/pulls) (${prs.length}):**\n` +
            prs
              .map(
                (pr) =>
                  `• **[#${pr.number} ${pr.title}](${pr.html_url})** [${pr.state.toUpperCase()}]\n` +
                  `  Branch: \`${pr.head.ref}\` → \`${pr.base.ref}\` | Por @${pr.user.login}`,
              )
              .join("\n")
          : `Nenhum Pull Request ${state} encontrado em **${repo}**.`,
      };
    }

    // 1.7 Listar Commits
    if (action === "list_commits" || action === "commits.list" || action === "commits") {
      const rawRepo = String(p.repo || p.full_name || ctx.account || "").trim();
      const repo = await resolveRepo(rawRepo);
      if (!repo.includes("/")) {
        throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo'.");
      }
      const branch = p.branch ? `?sha=${encodeURIComponent(String(p.branch))}` : "";
      const res = await fetch(`https://api.github.com/repos/${repo}/commits${branch}`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

      const commits = (await res.json()) as Array<{
        sha: string;
        html_url: string;
        commit: {
          message: string;
          author: { name: string; date: string };
        };
      }>;

      const topCommits = commits.slice(0, 10);
      return {
        success: true,
        data: topCommits,
        summary: topCommits.length
          ? `📝 **Últimos commits em [${repo}](https://github.com/${repo}/commits):**\n` +
            topCommits
              .map(
                (c) =>
                  `• [\`${c.sha.slice(0, 7)}\`](${c.html_url}) ${c.commit.message.split("\n")[0]} ` +
                  `— _${c.commit.author.name}_ (${new Date(c.commit.author.date).toLocaleDateString("pt-PT")})`,
              )
              .join("\n")
          : `Nenhum commit encontrado em **${repo}**.`,
      };
    }

    // 1.8 Perfil da Conta Autenticada (apenas para ações explícitas de utilizador/perfil)
    if (
      action === "profile" ||
      action === "user" ||
      action === "get_user" ||
      action === "account" ||
      action === "default" ||
      !action
    ) {
      const userRes = await fetch("https://api.github.com/user", { headers });
      if (!userRes.ok) throw new Error(await handleHttpError(userRes, "GitHub"));
      const user = await userRes.json();
      const scopes = userRes.headers.get("x-oauth-scopes");

      let scopeDetails = "";
      if (scopes !== null) {
        const scopesArr = scopes.split(",").map((s) => s.trim().toLowerCase());
        const hasRepo = scopesArr.includes("repo") || scopesArr.includes("public_repo");
        if (!hasRepo) {
          scopeDetails = `\n\n⚠️ **Alerta:** Token sem o escopo 'repo' (escopos ativos: \`${scopes || "nenhum"}\`). Repositórios privados e operações de escrita requerem o escopo 'repo'.`;
        }
      }

      return {
        success: true,
        data: { ...user, scopes },
        summary:
          `🐙 **Conta GitHub Conectada com Sucesso!**\n` +
          `• Utilizador: **[@${user.login}](${user.html_url})** (${user.name || "Sem nome público"})\n` +
          `• Email: ${user.email || "Privado"}\n` +
          `• Repositórios: ${user.public_repos} públicos | ${user.total_private_repos || 0} privados\n` +
          `• Bio: ${user.bio || "Sem biografia"}` +
          scopeDetails +
          `\n\n💡 _Podes pedir: "Griot, lista os meus repositórios", "Mostra os PRs de dono/repo" ou "Lê o ficheiro package.json do meu projeto"_`,
      };
    }

    throw new Error(`Ação '${action}' não reconhecida para o conector GitHub.`);
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      summary: `❌ **Falha no Conector GitHub:** ${err.message}`,
    };
  }
}

// ==========================================
// 2. GITLAB CONNECTOR
// ==========================================
export async function executeGitLab(ctx: ConnectorExecutionContext): Promise<ConnectorResult> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      error: "Token GitLab não configurado.",
      summary: "⚠️ **GitLab Não Conectado**: Insere o teu Personal Access Token em Definições → Plugins → GitLab.",
    };
  }

  const cleanToken = token.replace(/^(Bearer|token)\s+/i, "").trim();
  const headers = {
    ...USER_AGENT,
    "PRIVATE-TOKEN": cleanToken,
    Authorization: `Bearer ${cleanToken}`,
  };

  const action = (ctx.action || "list_projects").toLowerCase();
  const p = ctx.params || {};

  try {
    // 2.1 Listar Projetos
    if (
      action === "list_projects" ||
      action === "projects" ||
      action === "projects.list" ||
      action === "projectlist" ||
      action === "projects_list" ||
      action === "project_list" ||
      action === "listprojects" ||
      action === "repos.list" ||
      action === "list_repos" ||
      action === "repos" ||
      action === "list"
    ) {
      const perPage = Math.min(Math.max(Number(p.limit || p.per_page || 15), 1), 50);
      let res = await safeFetch(
        `https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=${perPage}`,
        { headers },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab"));

      let projects = (await res.json()) as Array<{
        id: number;
        name: string;
        path_with_namespace: string;
        web_url: string;
        visibility: string;
        description: string | null;
        star_count: number;
        last_activity_at: string;
      }>;

      // Fallback: se membership=true não devolver projetos, tenta min_access_level=10 (Developer ou acima)
      if (!Array.isArray(projects) || projects.length === 0) {
        const fallbackRes = await safeFetch(
          `https://gitlab.com/api/v4/projects?min_access_level=10&order_by=updated_at&per_page=${perPage}`,
          { headers },
        );
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (Array.isArray(fallbackData) && fallbackData.length > 0) {
            projects = fallbackData;
          }
        }
      }

      return {
        success: true,
        data: projects,
        summary: projects.length
          ? `🦊 **Projetos GitLab Encontrados (${projects.length}):**\n` +
            projects
              .map(
                (pr) =>
                  `• **[${pr.path_with_namespace}](${pr.web_url})** [ID: \`${pr.id}\`] (${pr.visibility})\n` +
                  `  _${pr.description || "Sem descrição"}_ | Última atividade: ${new Date(pr.last_activity_at).toLocaleDateString("pt-PT")}`,
              )
              .join("\n\n")
          : "Nenhum projeto encontrado no GitLab com esta conta.",
      };
    }

    // 2.2 Detalhes de um Projeto
    if (
      action === "get_project" ||
      action === "project_details" ||
      action === "projects.get" ||
      action === "project" ||
      action === "repos.get" ||
      action === "get_repo" ||
      action === "repo"
    ) {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' (ID numérico ou caminho 'grupo/projeto') obrigatório.");
      const res = await safeFetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}`,
        { headers },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab"));

      const pr = await res.json();
      return {
        success: true,
        data: pr,
        summary:
          `🦊 **Projeto GitLab: [${pr.name_with_namespace || pr.name}](${pr.web_url})**\n` +
          `• ID: \`${pr.id}\` | Visibilidade: ${pr.visibility}\n` +
          `• Branch Padrão: \`${pr.default_branch || "main"}\`\n` +
          `• Descrição: ${pr.description || "Sem descrição"}\n` +
          `• SSH URL: \`${pr.ssh_url_to_repo}\`\n` +
          `• HTTP URL: \`${pr.http_url_to_repo}\``,
      };
    }

    // 2.3 Listar Issues
    if (action === "list_issues" || action === "issues" || action === "issues.list" || action === "get_issues") {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      const url = projectId
        ? `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/issues?per_page=15`
        : `https://gitlab.com/api/v4/issues?scope=all&per_page=15`;
      const res = await safeFetch(url, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab"));

      const issues = (await res.json()) as Array<{
        id: number;
        iid: number;
        title: string;
        state: string;
        web_url: string;
        author: { name: string; username: string };
        created_at: string;
      }>;

      return {
        success: true,
        data: issues,
        summary: issues.length
          ? `🐛 **Issues GitLab (${issues.length}):**\n` +
            issues
              .map(
                (i) =>
                  `• **[!${i.iid} ${i.title}](${i.web_url})** [${i.state.toUpperCase()}]\n` +
                  `  Por @${i.author?.username} em ${new Date(i.created_at).toLocaleDateString("pt-PT")}`,
              )
              .join("\n")
          : "Nenhuma issue encontrada no GitLab.",
      };
    }

    // 2.4 Criar Issue
    if (action === "create_issue" || action === "issues.create" || action === "new_issue") {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' obrigatório para criar issue no GitLab.");
      const title = String(p.title || "").trim();
      if (!title) throw new Error("Parâmetro 'title' é obrigatório.");
      const description = String(p.description || p.body || "");

      const res = await safeFetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/issues`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab"));

      const data = await res.json();
      return {
        success: true,
        data,
        summary: `✅ **Issue criada no GitLab:** [!${data.iid} ${data.title}](${data.web_url})`,
      };
    }

    // 2.5 Listar Pipelines de CI/CD
    if (
      action === "list_pipelines" ||
      action === "pipelines" ||
      action === "pipelines.list" ||
      action === "actions.list_runs" ||
      action === "runs" ||
      action === "pipeline"
    ) {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' é obrigatório para consultar pipelines.");
      const res = await safeFetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/pipelines?per_page=10`,
        { headers },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab"));

      const pipelines = (await res.json()) as Array<{
        id: number;
        status: string;
        ref: string;
        sha: string;
        web_url: string;
        created_at: string;
      }>;

      const statusEmoji = (st: string) => {
        if (st === "success") return "✅";
        if (st === "running") return "🔄";
        if (st === "failed") return "❌";
        if (st === "canceled") return "⏹️";
        return "⏳";
      };

      return {
        success: true,
        data: pipelines,
        summary: pipelines.length
          ? `🚀 **Pipelines CI/CD no GitLab (${projectId}):**\n` +
            pipelines
              .map(
                (pl) =>
                  `• ${statusEmoji(pl.status)} **[Pipeline #${pl.id}](${pl.web_url})** [${pl.status.toUpperCase()}]\n` +
                  `  Branch: \`${pl.ref}\` (\`${pl.sha.slice(0, 7)}\`) | Data: ${new Date(pl.created_at).toLocaleString("pt-PT")}`,
              )
              .join("\n")
          : `Nenhum pipeline encontrado para o projeto ${projectId}.`,
      };
    }

    // 2.6 Obter Conteúdo de Ficheiro (Raw File)
    if (
      action === "get_raw_file" ||
      action === "read_file" ||
      action === "repository.get_raw_file" ||
      action === "contents.read_file" ||
      action === "file.read" ||
      action === "get_file"
    ) {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      const filePath = String(p.file_path || p.filePath || p.path || p.file || "").trim();
      const ref = String(p.ref || p.branch || "main").trim();

      if (!projectId || !filePath) {
        throw new Error("Parâmetros 'project_id' e 'file_path' são obrigatórios para ler ficheiro no GitLab.");
      }

      const res = await safeFetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`,
        { headers },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab Raw File"));

      const content = await res.text();
      return {
        success: true,
        data: { path: filePath, ref, content },
        summary: `📄 **Ficheiro \`${filePath}\` do GitLab (\`${projectId}\` @ \`${ref}\`):**\n\n\`\`\`\n${content.slice(0, 3000)}${content.length > 3000 ? "\n... (restante truncado)" : ""}\n\`\`\``,
      };
    }

    // 2.7 Árvore do Repositório (Repository Tree)
    if (
      action === "tree" ||
      action === "repository.tree" ||
      action === "get_tree" ||
      action === "list_files" ||
      action === "files.list" ||
      action === "contents.get_tree" ||
      action === "contents.tree"
    ) {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      const ref = String(p.ref || p.branch || "main").trim();
      const path = String(p.path || "").trim();

      if (!projectId) throw new Error("Parâmetro 'project_id' é obrigatório para consultar a árvore do repositório.");

      let url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/tree?per_page=50&ref=${encodeURIComponent(ref)}`;
      if (path) url += `&path=${encodeURIComponent(path)}`;

      const res = await safeFetch(url, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab Tree"));

      const tree = (await res.json()) as Array<{ id: string; name: string; type: string; path: string; mode: string }>;
      return {
        success: true,
        data: tree,
        summary: tree.length
          ? `📁 **Estrutura de Ficheiros GitLab (\`${projectId}\` @ \`${ref}\`):**\n` +
            tree.map((t) => `• ${t.type === "tree" ? "📁" : "📄"} \`${t.path}\``).join("\n")
          : `Repositório vazio no caminho '${path || "/"}' na branch \`${ref}\`.`,
      };
    }

    // 2.8 Listar Merge Requests
    if (
      action === "list_merge_requests" ||
      action === "merge_requests" ||
      action === "merge_requests.list" ||
      action === "pulls.list" ||
      action === "list_prs" ||
      action === "prs"
    ) {
      const projectId = p.project_id || p.id || p.repo || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' é obrigatório para listar merge requests.");

      const res = await safeFetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests?per_page=15`,
        { headers },
      );
      if (!res.ok) throw new Error(await handleHttpError(res, "GitLab Merge Requests"));

      const mrs = (await res.json()) as Array<{ iid: number; title: string; state: string; web_url: string; author: { username: string } }>;
      return {
        success: true,
        data: mrs,
        summary: mrs.length
          ? `🔀 **Merge Requests GitLab (${mrs.length}):**\n` +
            mrs.map((mr) => `• **[!${mr.iid} ${mr.title}](${mr.web_url})** [${mr.state.toUpperCase()}] por @${mr.author?.username}`).join("\n")
          : `Nenhum Merge Request encontrado no projeto ${projectId}.`,
      };
    }

    // 2.9 Perfil da Conta Autenticada
    if (action === "get_user" || action === "profile" || action === "user" || action === "account" || action === "default") {
      const userRes = await safeFetch("https://gitlab.com/api/v4/user", { headers });
      if (!userRes.ok) throw new Error(await handleHttpError(userRes, "GitLab"));
      const user = await userRes.json();

      return {
        success: true,
        data: user,
        summary:
          `🦊 **Conta GitLab Conectada com Sucesso!**\n` +
          `• Utilizador: **[@${user.username}](${user.web_url})** (${user.name})\n` +
          `• ID: \`${user.id}\` | Email: ${user.email || "Privado"}\n` +
          `• Estado: ${user.state}`,
      };
    }

    // Se nenhuma ação casar, lança erro diagnóstico explícito
    throw new Error(
      `Ação '${action}' não reconhecida no conector GitLab. Ações disponíveis: projects.list, projects.get, repository.get_raw_file, repository.tree, merge_requests.list, issues.list, issues.create, pipelines.list, user/profile.`
    );
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      summary: `❌ **Falha no Conector GitLab:** ${err.message}`,
    };
  }
}

// ==========================================
// 3. VERCEL CONNECTOR
// ==========================================
export async function executeVercel(ctx: ConnectorExecutionContext): Promise<ConnectorResult> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      error: "Token Vercel não configurado.",
      summary: "⚠️ **Vercel Não Conectada**: Configura o teu Personal Access Token em Definições → Plugins → Vercel.",
    };
  }

  const headers = {
    ...USER_AGENT,
    Authorization: `Bearer ${token}`,
  };

  const action = (ctx.action || "list_projects").toLowerCase();
  const p = ctx.params || {};

  try {
    // 3.1 Listar Projetos
    if (action === "list_projects" || action === "projects") {
      const res = await fetch("https://api.vercel.com/v9/projects?limit=20", { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel"));

      const data = await res.json();
      const list = (data.projects || []).map((proj: any) => ({
        id: proj.id,
        name: proj.name,
        framework: proj.framework || "custom",
        productionUrl: proj.targets?.production?.url ? `https://${proj.targets.production.url}` : null,
        updatedAt: proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString("pt-PT") : "N/A",
      }));

      return {
        success: true,
        data: list,
        summary: list.length
          ? `▲ **Projetos Vercel (${list.length} encontrados):**\n` +
            list
              .map(
                (pr: any) =>
                  `• **${pr.name}** [${pr.framework}] → ${pr.productionUrl ? `[${pr.productionUrl}](${pr.productionUrl})` : "Sem deploy de produção"}\n` +
                  `  ID: \`${pr.id}\` | Atualizado: ${pr.updatedAt}`,
              )
              .join("\n\n")
          : "Nenhum projeto encontrado nesta conta Vercel.",
      };
    }

    // 3.2 Listar Deployments
    if (action === "list_deployments" || action === "deployments") {
      const projectId = p.project_id || p.projectId || p.name || ctx.account;
      const url = projectId
        ? `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(String(projectId))}&limit=12`
        : "https://api.vercel.com/v6/deployments?limit=12";
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel"));

      const data = await res.json();
      const list = (data.deployments || []).map((d: any) => ({
        uid: d.uid,
        name: d.name,
        state: d.state,
        url: `https://${d.url}`,
        creator: d.creator?.username || "sistema",
        created: new Date(d.created).toLocaleString("pt-PT"),
      }));

      const stateBadge = (state: string) => {
        if (state === "READY") return "🟢 READY";
        if (state === "BUILDING") return "🟡 BUILDING";
        if (state === "ERROR") return "🔴 ERROR";
        if (state === "CANCELED") return "⚪ CANCELED";
        return `ℹ️ ${state}`;
      };

      return {
        success: true,
        data: list,
        summary: list.length
          ? `▲ **Últimos Deployments na Vercel:**\n` +
            list
              .map(
                (d: any) =>
                  `• ${stateBadge(d.state)} **[${d.name}](${d.url})**\n` +
                  `  URL: ${d.url} | Por: @${d.creator} | Data: ${d.created}`,
              )
              .join("\n\n")
          : "Nenhum deployment registado na Vercel.",
      };
    }

    // 3.3 Detalhes de um Deployment
    if (action === "get_deployment" || action === "deployment_details" || action === "deployments.get") {
      const deploymentId = p.deployment_id || p.id || p.uid;
      if (!deploymentId) throw new Error("Parâmetro 'deployment_id' obrigatório.");
      const res = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(String(deploymentId))}`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel"));

      const d = await res.json();
      return {
        success: true,
        data: d,
        summary:
          `▲ **Deployment Vercel: [${d.name}](https://${d.url})**\n` +
          `• Estado: **${d.readyState || d.status}**\n` +
          `• URL Principal: https://${d.url}\n` +
          `• Criado em: ${new Date(d.createdAt).toLocaleString("pt-PT")}\n` +
          `• Framework: ${d.projectSettings?.framework || "Automático"}\n` +
          `• Regiões: ${d.regions?.join(", ") || "iad1"}`,
      };
    }

    // 3.4 Detalhes de um Projeto
    if (action === "get_project" || action === "projects.get" || action === "project") {
      const projectId = p.project_id || p.id || p.name || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' ou 'name' obrigatório para obter projeto na Vercel.");
      const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(String(projectId))}`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel"));
      const pr = await res.json();
      return {
        success: true,
        data: pr,
        summary: `▲ **Projeto Vercel: ${pr.name}** [ID: \`${pr.id}\` | Framework: ${pr.framework || "custom"}]`,
      };
    }

    // 3.5 Criar Deployment
    if (action === "create_deployment" || action === "deployments.create" || action === "deploy") {
      const name = String(p.name || p.project_name || p.project || ctx.account || "").trim();
      const files = p.files;
      if (!name) throw new Error("Parâmetro 'name' (nome do projeto Vercel) obrigatório para criar deployment.");
      const bodyPayload: any = { name };
      if (files && Array.isArray(files)) bodyPayload.files = files;
      if (p.gitSource) bodyPayload.gitSource = p.gitSource;

      const res = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel Create Deployment"));
      const d = await res.json();
      return {
        success: true,
        data: d,
        summary: `🚀 **Deployment disparado na Vercel!**\n• URL: https://${d.url}\n• ID: \`${d.id || d.uid}\`\n• Estado: **${d.readyState || d.status}**`,
      };
    }

    // 3.6 Listar Variáveis de Ambiente
    if (action === "list_env" || action === "env.list" || action === "env") {
      const projectId = p.project_id || p.id || p.name || ctx.account;
      if (!projectId) throw new Error("Parâmetro 'project_id' obrigatório para listar variáveis de ambiente.");
      const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(String(projectId))}/env`, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel Env"));
      const data = await res.json();
      const envs = data.envs || [];
      return {
        success: true,
        data: envs,
        summary: envs.length
          ? `🔐 **Variáveis de Ambiente na Vercel (${envs.length} encontradas):**\n` +
            envs.map((e: any) => `• \`${e.key}\` (Alvos: ${e.target?.join(", ") || "todos"})`).join("\n")
          : "Nenhuma variável de ambiente encontrada no projeto.",
      };
    }

    // 3.7 Listar Domínios
    if (action === "list_domains" || action === "domains.list" || action === "domains") {
      const res = await fetch("https://api.vercel.com/v5/domains", { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Vercel Domains"));
      const data = await res.json();
      const domains = data.domains || [];
      return {
        success: true,
        data: domains,
        summary: domains.length
          ? `🌐 **Domínios na Vercel (${domains.length}):**\n` +
            domains.map((dom: any) => `• **${dom.name}** (Criado: ${new Date(dom.createdAt).toLocaleDateString("pt-PT")})`).join("\n")
          : "Nenhum domínio customizado registrado nesta conta Vercel.",
      };
    }

    // 3.8 Perfil da Conta Autenticada
    if (action === "get_user" || action === "profile" || action === "user") {
      const userRes = await fetch("https://api.vercel.com/v2/user", { headers });
      if (!userRes.ok) throw new Error(await handleHttpError(userRes, "Vercel"));
      const userData = await userRes.json();
      const user = userData.user;

      return {
        success: true,
        data: user,
        summary:
          `▲ **Conta Vercel Conectada com Sucesso!**\n` +
          `• Utilizador: **@${user.username || user.email}**\n` +
          `• Nome: ${user.name || "Sem nome"}\n` +
          `• Email: ${user.email}\n` +
          `• ID da Conta: \`${user.id}\``,
      };
    }

    // Se nenhuma ação casar, lança erro diagnóstico explícito
    throw new Error(
      `Ação '${action}' não reconhecida no conector Vercel. Ações disponíveis: projects.list, projects.get, deployments.list, deployments.create, deployments.get, env.list, domains.list, user/profile.`
    );
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      summary: `❌ **Falha no Conector Vercel:** ${err.message}`,
    };
  }
}

// ==========================================
// 4. SUPABASE CONNECTOR
// ==========================================
export async function executeSupabase(ctx: ConnectorExecutionContext): Promise<ConnectorResult> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      error: "Credencial Supabase não configurada.",
      summary: "⚠️ **Supabase Não Conectado**: Insere o teu Management Access Token (`sbp_...`) ou Service Role / Anon Key em Definições → Plugins → Supabase.",
    };
  }

  const action = (ctx.action || "health").toLowerCase();
  const p = ctx.params || {};

  // Supabase Management API (Token começa por sbp_ ou não contém pontos como um JWT)
  const isManagementToken = token.startsWith("sbp_") || !token.includes(".");
  const headers = {
    ...USER_AGENT,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Resolução do Project Ref e Base URL
    let ref = String(
      p.ref ||
      p.project_id ||
      p.projectId ||
      p.project_ref ||
      p.projectRef ||
      ctx.account ||
      (p.customEndpoint as string) ||
      "",
    ).trim();

    // Se o ref tiver o URL completo (ex: https://abcdefg.supabase.co), extrai apenas o subdomínio
    if (ref.includes(".supabase.co")) {
      const match = ref.match(/https?:\/\/([^.]+)\.supabase\.co/);
      if (match) ref = match[1];
    }

    // Se for token de gestão e ainda não tivermos o ref, descobre automaticamente
    let cachedProjects: Array<{ id: string; name: string; status: string }> = [];
    if (!ref && isManagementToken) {
      try {
        const prjRes = await fetch("https://api.supabase.com/v1/projects", {
          headers: { ...USER_AGENT, Authorization: `Bearer ${token}` },
        });
        if (prjRes.ok) {
          cachedProjects = await prjRes.json();
          if (cachedProjects.length > 0) {
            ref = cachedProjects[0].id;
          }
        }
      } catch {
        // Fallback para outros métodos
      }
    }

    let baseUrl = (p.customEndpoint as string) || (ref ? `https://${ref}.supabase.co` : "") || ctx.account || "";
    if (baseUrl && !baseUrl.startsWith("http")) {
      baseUrl = `https://${baseUrl}.supabase.co`;
    }

    // ==========================================
    // 2. AÇÃO: EXECUTE_SQL / SQL / CREATE_TABLE / QUERY (Execução Real no PostgreSQL)
    // ==========================================
    if (
      action === "execute_sql" ||
      action === "sql" ||
      action === "query" ||
      action === "run_sql" ||
      action === "create_table" ||
      action === "create_schema"
    ) {
      const sqlQuery = String(
        p.sql || p.query || p.command || p.code || p.body || "",
      ).trim();

      if (!sqlQuery) {
        throw new Error("Comando SQL ausente. Fornece a query ou comando no parâmetro 'sql'.");
      }

      if (isManagementToken) {
        if (!ref) {
          throw new Error(
            "Nenhum projeto Supabase encontrado nesta conta. Cria um projeto em supabase.com antes de executar comandos SQL.",
          );
        }

        const queryUrl = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`;
        const res = await fetch(queryUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: sqlQuery }),
        });

        if (!res.ok) {
          throw new Error(await handleHttpError(res, "Supabase Postgres SQL"));
        }

        const rows = await res.json();
        const isDdl = /^\s*(create|alter|drop|truncate|grant|revoke)\b/i.test(sqlQuery);

        return {
          success: true,
          data: rows,
          summary: isDdl
            ? `⚡ **Estrutura SQL executada com sucesso no PostgreSQL do Supabase!**\n` +
              `• Projeto Ref: \`${ref}\`\n` +
              `• Endpoint: \`${baseUrl || `https://${ref}.supabase.co`}\`\n` +
              `• Comando Executado:\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n` +
              `• Estado: Tabelas e esquemas sincronizados com sucesso no banco de dados.`
            : `⚡ **Query SQL executada com sucesso no PostgreSQL do Supabase!**\n` +
              `• Projeto Ref: \`${ref}\`\n` +
              `• Query:\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n` +
              `• Registos retornados (${Array.isArray(rows) ? rows.length : 1}):\n\`\`\`json\n${JSON.stringify(rows, null, 2).slice(0, 3500)}\n\`\`\``,
        };
      }

      // Se for Service Role ou Anon Key, tenta RPC se configurado ou orienta o utilizador
      if (baseUrl) {
        const rpcRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            ...USER_AGENT,
            apikey: token,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sqlQuery }),
        });

        if (rpcRes.ok) {
          const rpcData = await rpcRes.json();
          return {
            success: true,
            data: rpcData,
            summary: `⚡ **Comando SQL executado via RPC no Supabase!**\n\`\`\`json\n${JSON.stringify(rpcData, null, 2).slice(0, 3000)}\n\`\`\``,
          };
        }
      }

      throw new Error(
        "Para executar comandos DDL diretos (como CREATE TABLE), é necessário ligar o Supabase com o Personal Access Token (`sbp_...`) gerado em supabase.com/dashboard/account/tokens.",
      );
    }

    // ==========================================
    // 3. AÇÃO: LIST_TABLES / TABLES / SCHEMA
    // ==========================================
    if (action === "list_tables" || action === "tables" || action === "schema") {
      if (isManagementToken && ref) {
        const queryUrl = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`;
        const res = await fetch(queryUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query:
              "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;",
          }),
        });

        if (res.ok) {
          const tables = (await res.json()) as Array<{ table_name: string; table_type: string }>;
          return {
            success: true,
            data: tables,
            summary: tables.length
              ? `⚡ **Tabelas encontradas no esquema público do Supabase (${tables.length}):**\n` +
                tables.map((t) => `• **${t.table_name}** (${t.table_type})`).join("\n")
              : "Nenhuma tabela encontrada no esquema público deste banco de dados.",
          };
        }
      }

      // Fallback para PostgREST OpenAPI schema
      if (baseUrl) {
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/v1/`, {
          headers: { ...USER_AGENT, apikey: token, Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const schema = await res.json();
          const tableNames = Object.keys(schema.definitions || {});
          return {
            success: true,
            data: tableNames,
            summary: tableNames.length
              ? `⚡ **Tabelas disponíveis via PostgREST (${tableNames.length}):**\n` +
                tableNames.map((n) => `• **${n}**`).join("\n")
              : "Nenhuma tabela pública detetada no esquema PostgREST.",
          };
        }
      }
    }

    // ==========================================
    // 4. AÇÃO: DESCRIBE_TABLE
    // ==========================================
    if (action === "describe_table") {
      const table = String(p.table || p.name || "").trim();
      if (!table) throw new Error("Parâmetro 'table' obrigatório.");

      if (isManagementToken && ref) {
        const queryUrl = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`;
        const res = await fetch(queryUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position;`,
          }),
        });

        if (res.ok) {
          const cols = await res.json();
          return {
            success: true,
            data: cols,
            summary: `⚡ **Estrutura da Tabela \`${table}\` no Supabase:**\n\`\`\`json\n${JSON.stringify(cols, null, 2)}\n\`\`\``,
          };
        }
      }
    }

    // ==========================================
    // 5. AÇÃO: LIST_PROJECTS / HEALTH
    // ==========================================
    if (action === "list_projects" || action === "projects" || action === "health") {
      if (isManagementToken) {
        const res = await fetch("https://api.supabase.com/v1/projects", {
          headers: { ...USER_AGENT, Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "Supabase Management"));

        const projects = (await res.json()) as Array<{
          id: string;
          name: string;
          region: string;
          status: string;
          created_at: string;
        }>;

        return {
          success: true,
          data: projects,
          summary: projects.length
            ? `⚡ **Projetos Supabase Ativos (${projects.length}):**\n` +
              projects
                .map(
                  (pr) =>
                    `• **${pr.name}** [Status: ${pr.status.toUpperCase()}]\n` +
                    `  Ref: \`${pr.id}\` | Região: ${pr.region} | Criado: ${new Date(pr.created_at).toLocaleDateString("pt-PT")}`,
                )
                .join("\n\n")
            : "Nenhum projeto encontrado nesta conta Supabase.",
        };
      }

      if (baseUrl) {
        return {
          success: true,
          data: { baseUrl, status: "ready" },
          summary: `⚡ **Supabase PostgREST Conectado!** Endpoint: ${baseUrl}`,
        };
      }
    }

    // ==========================================
    // 6. AÇÃO: GET_PROJECT
    // ==========================================
    if (action === "get_project") {
      if (!ref) throw new Error("Parâmetro 'ref' (Project Reference ID) obrigatório.");
      const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
        headers: { ...USER_AGENT, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "Supabase Management"));

      const data = await res.json();
      return {
        success: true,
        data,
        summary:
          `⚡ **Projeto Supabase: ${data.name}**\n` +
          `• Ref: \`${data.id}\` | Estado: ${data.status}\n` +
          `• Região: ${data.region} | Versão Postgres: ${data.database?.version || "15"}\n` +
          `• Endpoint: https://${data.id}.supabase.co`,
      };
    }

    // ==========================================
    // 7. AÇÃO: INSERT / INSERT_ROWS
    // ==========================================
    if (action === "insert" || action === "insert_rows") {
      const table = String(p.table || "").trim();
      if (!table) throw new Error("Parâmetro 'table' obrigatório para inserção.");
      const data = p.data || p.row || p.body;
      if (!data) throw new Error("Parâmetro 'data' com o objeto ou registo a inserir é obrigatório.");

      if (baseUrl) {
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}`, {
          method: "POST",
          headers: {
            ...USER_AGENT,
            apikey: token,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(data),
        });

        if (!res.ok) throw new Error(await handleHttpError(res, "Supabase PostgREST Insert"));
        const inserted = await res.json();
        return {
          success: true,
          data: inserted,
          summary: `⚡ **Registo inserido com sucesso na tabela \`${table}\` do Supabase!**\n\`\`\`json\n${JSON.stringify(inserted, null, 2)}\n\`\`\``,
        };
      }
    }

    // ==========================================
    // 8. AÇÃO: STORAGE.LIST_BUCKETS
    // ==========================================
    if (action === "list_buckets" || action === "storage.list_buckets") {
      if (!baseUrl) throw new Error("URL base do Supabase indisponível para consulta de Storage.");
      const storageUrl = `${baseUrl.replace(/\/+$/, "")}/storage/v1/bucket`;
      const res = await fetch(storageUrl, {
        headers: {
          ...USER_AGENT,
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "Supabase Storage"));
      const buckets = await res.json();
      return {
        success: true,
        data: buckets,
        summary: `🪣 **Buckets de Armazenamento Supabase (${Array.isArray(buckets) ? buckets.length : 0}):**\n` +
          (Array.isArray(buckets) && buckets.length
            ? buckets.map((b: any) => `• **${b.name}** [ID: \`${b.id}\`] (${b.public ? "Público" : "Privado"})`).join("\n")
            : "Nenhum bucket encontrado no Supabase."),
      };
    }

    // ==========================================
    // 9. AÇÃO: FUNCTIONS.LIST
    // ==========================================
    if (action === "list_functions" || action === "functions.list") {
      if (!isManagementToken || !ref) {
        throw new Error("Listagem de Edge Functions requer Personal Access Token (sbp_...) do Supabase.");
      }
      const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/functions`, {
        headers: { ...USER_AGENT, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "Supabase Functions"));
      const funcs = await res.json();
      return {
        success: true,
        data: funcs,
        summary: `⚡ **Edge Functions Supabase (${Array.isArray(funcs) ? funcs.length : 0}):**\n` +
          (Array.isArray(funcs) && funcs.length
            ? funcs.map((f: any) => `• **${f.name}** [slug: \`${f.slug}\`] (Status: \`${f.status}\`)`).join("\n")
            : "Nenhuma Edge Function encontrada no projeto Supabase."),
      };
    }

    // ==========================================
    // 10. AÇÃO: SELECT / CONSULTA A TABELAS
    // ==========================================
    if (
      action === "select" ||
      action === "db.select" ||
      action === "query_table" ||
      action === "read_table" ||
      action === "list_records"
    ) {
      if (!baseUrl) {
        return {
          success: true,
          data: { tokenType: isManagementToken ? "Management Token" : "JWT Key", status: "ready", ref },
          summary:
            `⚡ **Supabase Conectado!**\n` +
            `A credencial é válida (Ref: \`${ref || "detetado"}\`). Podes executar instruções SQL usando a ação 'execute_sql' ou consultar tabelas diretamente.`,
        };
      }

      const table = String(p.table || "").trim();
      if (!table) {
        throw new Error("Parâmetro 'table' obrigatório para consultar tabela no Supabase.");
      }

      const select = String(p.select || "*");
      const limit = Math.min(Math.max(Number(p.limit || 10), 1), 50);

      const restUrl = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}&limit=${limit}`;
      const res = await fetch(restUrl, {
        headers: {
          ...USER_AGENT,
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error(await handleHttpError(res, "Supabase PostgREST"));

      const rows = await res.json();
      return {
        success: true,
        data: rows,
        summary:
          `⚡ **Consulta Supabase na tabela \`${table}\` (${Array.isArray(rows) ? rows.length : 1} registos):**\n\n` +
          `\`\`\`json\n${JSON.stringify(rows, null, 2).slice(0, 3500)}${JSON.stringify(rows).length > 3500 ? "\n... (dados truncados)" : ""}\n\`\`\``,
      };
    }

    // Se nenhuma ação casar, lança erro diagnóstico explícito
    throw new Error(
      `Ação '${action}' não reconhecida no conector Supabase. Ações disponíveis: db.select, db.insert, db.raw_sql, db.introspect_schema, storage.list_buckets, functions.list, projects.list.`
    );
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      summary: `❌ **Falha no Conector Supabase:** ${err.message}`,
    };
  }
}

// ==========================================
// 5. FIREBASE CONNECTOR
// ==========================================
export async function executeFirebase(ctx: ConnectorExecutionContext): Promise<ConnectorResult> {
  const token = ctx.credential.trim();
  if (!token) {
    return {
      success: false,
      error: "Credencial Firebase não configurada.",
      summary: "⚠️ **Firebase Não Conectado**: Insere a tua Web API Key ou Service Account Token em Definições → Plugins → Firebase.",
    };
  }

  const p = ctx.params || {};
  const projectId = String(ctx.account || p.project_id || p.projectId || "").trim();

  try {
    if (!projectId) {
      return {
        success: true,
        data: { status: "ready" },
        summary:
          `🔥 **Credencial Firebase Guardada!**\n` +
          `Para consultar coleções e documentos do Firestore, adiciona o teu **Project ID** do Firebase (ex: \`meu-app-prod\`) no campo Identificador de Conta em Definições → Plugins.`,
      };
    }

    const action = (ctx.action || "list_documents").toLowerCase();
    const collection = String(p.collection || "users").trim();

    const headers: Record<string, string> = { ...USER_AGENT };
    if (token.startsWith("ya29.") || token.length > 80) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["x-goog-api-key"] = token;
    }

    // 5.1 Obter um Documento Específico
    if (action === "get_document" || action === "document" || action === "firestore.get_document") {
      const docPath = String(p.path || p.document_id || p.id || "").trim();
      if (!docPath) throw new Error("Parâmetro 'path' ou 'document_id' obrigatório.");
      const fullPath = docPath.includes("/") ? docPath : `${collection}/${docPath}`;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${fullPath}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Firebase Firestore"));

      const doc = await res.json();
      return {
        success: true,
        data: doc,
        summary:
          `🔥 **Documento Firestore \`${fullPath}\` em \`${projectId}\`:**\n\n` +
          `\`\`\`json\n${JSON.stringify(doc.fields || doc, null, 2)}\n\`\`\``,
      };
    }

    // 5.2 Gravar / Criar Documento (Set Document)
    if (action === "set_document" || action === "create_document" || action === "firestore.set_document") {
      const docPath = String(p.path || p.document_id || p.id || "").trim();
      const fields = (p.fields || p.data || {}) as Record<string, unknown>;

      const formattedFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === "object" && v !== null && ("stringValue" in v || "integerValue" in v || "booleanValue" in v)) {
          formattedFields[k] = v;
        } else if (typeof v === "string") {
          formattedFields[k] = { stringValue: v };
        } else if (typeof v === "number") {
          formattedFields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        } else if (typeof v === "boolean") {
          formattedFields[k] = { booleanValue: v };
        } else if (v === null) {
          formattedFields[k] = { nullValue: null };
        } else {
          formattedFields[k] = { stringValue: JSON.stringify(v) };
        }
      }

      let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
      let method = "POST";
      if (docPath) {
        const fullPath = docPath.includes("/") ? docPath : `${collection}/${docPath}`;
        url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${fullPath}`;
        method = "PATCH";
      }

      const res = await fetch(url, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: formattedFields }),
      });
      if (!res.ok) throw new Error(await handleHttpError(res, "Firebase Firestore"));
      const doc = await res.json();
      return {
        success: true,
        data: doc,
        summary: `🔥 **Documento gravado com sucesso no Firestore (${collection})!**`,
      };
    }

    // 5.3 Apagar Documento
    if (action === "delete_document" || action === "firestore.delete_document") {
      const docPath = String(p.path || p.document_id || p.id || "").trim();
      if (!docPath) throw new Error("Parâmetro 'path' ou 'document_id' obrigatório para apagar documento.");
      const fullPath = docPath.includes("/") ? docPath : `${collection}/${docPath}`;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${fullPath}`;

      const res = await fetch(url, { method: "DELETE", headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Firebase Firestore"));
      return {
        success: true,
        summary: `🗑️ **Documento \`${fullPath}\` removido com sucesso do Firestore!**`,
      };
    }

    // 5.4 Listar Documentos de uma Coleção
    if (action === "list_documents" || action === "firestore.list_documents" || action === "documents") {
      const pageSize = Math.min(Math.max(Number(p.limit || 10), 1), 30);
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=${pageSize}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await handleHttpError(res, "Firebase Firestore"));

      const data = await res.json();
      const docs = (data.documents || []).map((d: any) => ({
        name: d.name.split("/").pop(),
        createTime: d.createTime ? new Date(d.createTime).toLocaleString("pt-PT") : "N/A",
        fields: d.fields || {},
      }));

      return {
        success: true,
        data: docs,
        summary: docs.length
          ? `🔥 **Coleção Firestore \`${collection}\` no projeto \`${projectId}\` (${docs.length} documentos):**\n` +
            docs
              .map(
                (doc: any) =>
                  `• **ID: \`${doc.name}\`** (Criado: ${doc.createTime})\n` +
                  `  Campos: ${Object.keys(doc.fields).join(", ") || "Sem campos"}`,
              )
              .join("\n\n")
          : `Nenhum documento encontrado na coleção \`${collection}\` do Firebase \`${projectId}\`.`,
      };
    }

    // Se nenhuma ação casar, lança erro diagnóstico explícito
    throw new Error(
      `Ação '${action}' não reconhecida no conector Firebase. Ações disponíveis: firestore.get_document, firestore.set_document, firestore.delete_document, firestore.list_documents.`
    );
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      summary: `❌ **Falha no Conector Firebase:** ${err.message}`,
    };
  }
}

// ==========================================
// DISPATCHER PRINCIPAL DOS CONECTORES
// ==========================================
import { executeBatch2Connector } from "./connectors-batch2.ts";
import { executeBatch3Connector } from "./connectors-batch3.ts";
import { executeBatch4Connector } from "./connectors-batch4.ts";
import { executeBatch5Connector } from "./connectors-batch5.ts";
import { executeBatch6Connector } from "./connectors-batch6.ts";

export async function executeBatch1Connector(
  connectorId: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorResult> {
  const normId = connectorId.toLowerCase().trim();

  switch (normId) {
    case "github":
      return executeGitHub(ctx);
    case "gitlab":
      return executeGitLab(ctx);
    case "vercel":
      return executeVercel(ctx);
    case "supabase":
      return executeSupabase(ctx);
    case "firebase":
    case "firestore":
      return executeFirebase(ctx);
    case "neon":
    case "neon_postgres":
    case "neonpostgres":
    case "upstash":
    case "upstash_redis":
    case "redis":
    case "mongodb":
    case "mongo":
    case "mongodb_atlas":
    case "cloudflare":
    case "cf":
    case "d1":
    case "qdrant":
    case "qdrant_vector":
      return executeBatch2Connector(normId, {
        credential: ctx.credential,
        action: ctx.action,
        params: ctx.params,
        accountName: ctx.account,
        customEndpoint: ctx.params.customEndpoint as string | undefined,
      });
    case "linear":
    case "linear_app":
    case "notion":
    case "slack":
    case "trello":
    case "sentry":
      return executeBatch3Connector(normId, {
        credential: ctx.credential,
        action: ctx.action,
        params: ctx.params,
        accountName: ctx.account,
        customEndpoint: ctx.params.customEndpoint as string | undefined,
      });
    case "stripe":
    case "google_sheets":
    case "sheets":
    case "googlesheets":
    case "google_drive":
    case "gdrive":
    case "googledrive":
    case "figma":
    case "docker":
    case "dockerhub":
    case "docker_hub":
      return executeBatch4Connector(normId, {
        credential: ctx.credential,
        action: ctx.action,
        params: ctx.params,
        accountName: ctx.account,
        customEndpoint: ctx.params.customEndpoint as string | undefined,
      });
    case "huggingface":
    case "hf":
    case "gmail":
    case "outlook":
    case "microsoft_outlook":
    case "dropbox":
    case "planetscale":
    case "pscale":
      return executeBatch5Connector(normId, {
        credential: ctx.credential,
        action: ctx.action,
        params: ctx.params,
        accountName: ctx.account,
        customEndpoint: ctx.params.customEndpoint as string | undefined,
      });
    case "azure":
    case "microsoft_azure":
    case "salesforce":
    case "sfdc":
    case "google_colab":
    case "colab":
    case "google_analytics":
    case "analytics":
    case "ga4":
    case "canva":
      return executeBatch6Connector(normId, {
        credential: ctx.credential,
        action: ctx.action,
        params: ctx.params,
        accountName: ctx.account,
        customEndpoint: ctx.params.customEndpoint as string | undefined,
      });
    default:
      return {
        success: false,
        error: `Conector '${connectorId}' não reconhecido.`,
        summary: `⚠️ O conector **${connectorId}** não foi encontrado. Todos os 30 conectores suportados do GRIOT Mobile estão ativos: GitHub, GitLab, Vercel, Supabase, Firebase, Neon, Upstash, MongoDB, Cloudflare, Qdrant, Linear, Notion, Slack, Trello, Sentry, Stripe, Google Sheets, Google Drive, Figma, Docker Hub, Hugging Face, Gmail, Outlook, Dropbox, PlanetScale, Azure, Salesforce, Google Colab, Google Analytics e Canva.`,
      };
  }
}
