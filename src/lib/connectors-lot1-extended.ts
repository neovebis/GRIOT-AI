/**
 * GRIOT Lot 1 Extended Connector Engine
 * 
 * Implementação integral e de alta fidelidade para todos os métodos do Lote 1:
 * 1. GITHUB (repos, contents, branches, pulls, issues, actions)
 * 2. GITLAB (projects, repository, merge_requests, pipelines)
 * 3. VERCEL (projects, env, deployments, domains)
 * 4. SUPABASE (projects, api_keys, db, storage, functions)
 * 5. FIREBASE (firestore, auth, rtdb, hosting)
 */

import { executeBatch1Connector, type ConnectorExecutionContext, type ConnectorResult } from "./connectors-batch1";
import { safeFetch, handleHttpError } from "./connector-http";

const USER_AGENT = { "User-Agent": "Griot-Mobile-Agent/1.0.49" };

export async function executeLot1Extended(
  connector: string,
  ctx: ConnectorExecutionContext,
): Promise<ConnectorResult> {
  const normId = connector.toLowerCase().trim();
  const rawAction = (ctx.action || "default").trim();
  const action = rawAction.toLowerCase();
  const p = ctx.params || {};
  const token = ctx.credential?.trim() || "";

  // =========================================================================
  // 1. GITHUB
  // =========================================================================
  if (normId === "github") {
    if (!token) {
      return {
        success: false,
        error: "Token GitHub não configurado.",
        summary: "⚠️ **GitHub Não Conectado**: Insere o teu Personal Access Token em Definições → Plugins → GitHub.",
      };
    }

    const cleanToken = token.replace(/^(Bearer|token)\s+/i, "").trim();
    const headers: Record<string, string> = {
      ...USER_AGENT,
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/vnd.github.v3+json",
    };

    let owner = (ctx.account || "").trim();

    // Helper para auto-detectar o dono da conta via API caso não venha no contexto
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
        // Ignora falha de lookup de perfil
      }
      return "";
    };

    // Helper para auto-completar dono/repo quando o utilizador ou modelo passa apenas o nome do repositório ou URL completa
    const resolveRepo = async (targetRepo: string): Promise<string> => {
      let r = (targetRepo || "").trim();
      if (!r) return "";
      // Limpa URLs completas do GitHub e sufixo .git
      r = r
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/^git@github\.com:/i, "")
        .replace(/\.git$/i, "")
        .replace(/^\/+|\/+$/g, "");
      if (r.includes("/")) return r;
      const currentOwner = await resolveOwner();
      return currentOwner ? `${currentOwner}/${r}` : r;
    };

    let repo = String(p.repo || p.full_name || p.repository || "").trim();

    try {
      // 1. repos.create
      if (
        action === "repos.create" ||
        action === "create_repo" ||
        action === "repo.create" ||
        action === "create" ||
        action === "new_repo" ||
        action === "repository.create"
      ) {
        const rawName = String(
          p.name || p.repo || p.repository || p.title || p.repo_name || ""
        ).trim();
        const name = rawName.includes("/") ? rawName.split("/").pop()!.trim() : rawName;
        if (!name) throw new Error("Parâmetro 'name' (ou 'repo') é obrigatório para criar repositório.");

        const isPrivate = p.private !== undefined ? Boolean(p.private) : false;
        const autoInit = p.auto_init !== undefined ? Boolean(p.auto_init) : true;

        const res = await safeFetch("https://api.github.com/user/repos", {
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
          if (res.status === 403 || res.status === 404) {
            if (scopes !== null && !scopes.includes("repo") && !scopes.includes("public_repo")) {
              throw new Error(
                `Permissão insuficiente para criar repositório. O token atual tem os escopos [${scopes || "nenhum"}], mas requer o escopo 'repo'. Aceda a github.com/settings/tokens para adicionar o escopo 'repo'.`
              );
            }
          }
          throw new Error(await handleHttpError(res, "GitHub"));
        }

        const data = await res.json();
        return {
          success: true,
          data,
          summary:
            `📦 **Repositório Criado no GitHub com Sucesso!**\n` +
            `• Nome: **[${data.full_name}](${data.html_url})**\n` +
            `• Visibilidade: ${data.private ? "Privado 🔒" : "Público 🌐"}\n` +
            `• Branch Padrão: \`${data.default_branch || "main"}\`\n` +
            `• Clone HTTPS: \`${data.clone_url}\`\n\n` +
            `💡 _Podes pedir: "Griot, grava o ficheiro README.md no repositório ${data.full_name}" ou "Cria um ficheiro index.ts"_`,
        };
      }

      // 2. repos.list
      if (
        action === "repos.list" ||
        action === "list_repos" ||
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
        const perPage = Math.min(Math.max(Number(p.limit || p.per_page || 30), 1), 100);
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
        // Se falhar com 422 ou 400 (ex: affiliation não suportado em fine-grained PAT), tenta chamada limpa
        if (!res.ok && (res.status === 422 || res.status === 400) && url.includes("&affiliation=")) {
          url = `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}`;
          res = await safeFetch(url, { headers });
        }
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

        const scopes = res.headers.get("x-oauth-scopes");
        const repos = (await res.json()) as Array<{
          name: string;
          full_name: string;
          private: boolean;
          html_url: string;
          clone_url: string;
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
          clone_url: r.clone_url,
          stars: r.stargazers_count,
          forks: r.forks_count,
          language: r.language || "N/A",
          updated: new Date(r.updated_at).toLocaleDateString("pt-PT"),
          description: r.description || "Sem descrição",
          default_branch: r.default_branch,
        }));

        let scopeWarning = "";
        if (scopes !== null && !scopes.includes("repo") && !scopes.includes("public_repo")) {
          scopeWarning = `\n\n⚠️ **Aviso de Permissões:** O token atual possui apenas os escopos: \`${scopes || "nenhum"}\`. Para ver e gerir **repositórios privados**, gera um Personal Access Token com o escopo **'repo'** em [github.com/settings/tokens](https://github.com/settings/tokens).`;
        }

        return {
          success: true,
          data: list,
          summary: list.length
            ? `📦 **Repositórios GitHub Encontrados (${list.length}):**\n` +
              list
                .map(
                  (r) =>
                    `• **[${r.full_name}](${r.url})** ${r.private ? "🔒 Privado" : "🌐 Público"} ` +
                    `| ⭐ ${r.stars} | ${r.language} | Atualizado: ${r.updated}\n  _${r.description}_`
                )
                .join("\n\n") +
              scopeWarning
            : `Nenhum repositório encontrado na conta conectada.${scopeWarning || "\nPodes criar um pedindo: 'Griot, cria um repositório chamado meu-projeto'."}`,
        };
      }

      // 3. repos.get
      if (
        action === "repos.get" ||
        action === "get_repo" ||
        action === "repo_details" ||
        action === "repo" ||
        action === "get" ||
        action === "projects.get" ||
        action === "get_project" ||
        action === "project" ||
        action === "repository"
      ) {
        let rawRepo = String(p.repo || p.full_name || p.name || repo || "").trim();
        let targetRepo = await resolveRepo(rawRepo);

        if (!targetRepo || !targetRepo.includes("/")) {
          throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/nome-do-repo' (ex: facebook/react ou 'nome-do-repo' da tua conta).");
        }

        let res = await safeFetch(`https://api.github.com/repos/${targetRepo}`, { headers });

        // Se 404, tenta busca insensível a maiúsculas/minúsculas entre os repositórios do utilizador
        if (res.status === 404) {
          try {
            const listRes = await safeFetch(
              `https://api.github.com/user/repos?per_page=100`,
              { headers }
            );
            if (listRes.ok) {
              const allRepos = (await listRes.json()) as Array<{ full_name: string; name: string }>;
              const simpleName = rawRepo.includes("/") ? rawRepo.split("/").pop()! : rawRepo;
              const matched = allRepos.find(
                (r) =>
                  r.full_name.toLowerCase() === targetRepo.toLowerCase() ||
                  r.name.toLowerCase() === simpleName.toLowerCase()
              );
              if (matched) {
                targetRepo = matched.full_name;
                res = await safeFetch(`https://api.github.com/repos/${targetRepo}`, { headers });
              }
            }
          } catch {
            // Continua
          }
        }

        if (!res.ok) {
          const scopes = res.headers.get("x-oauth-scopes");
          if (res.status === 404) {
            let scopeHelp = "";
            if (scopes !== null && !scopes.includes("repo")) {
              scopeHelp = `\n\n⚠️ **Causa provável:** O teu Personal Access Token tem os escopos: \`${scopes || "nenhum"}\` (falta o escopo **'repo'**).\nSe o repositório \`${targetRepo}\` for **privado**, a API do GitHub esconde a sua existência devolvendo 404 por segurança.\n👉 Gera um token com o escopo **'repo'** em [github.com/settings/tokens](https://github.com/settings/tokens) e atualiza em Definições → Plugins → GitHub.`;
            }
            throw new Error(`Repositório '${targetRepo}' não encontrado no GitHub (404 Not Found).${scopeHelp}`);
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
            `• Clone HTTPS: \`${data.clone_url}\``,
        };
      }

      // 4. contents.read_file
      if (
        action === "contents.read_file" ||
        action === "read_file" ||
        action === "get_file" ||
        action === "file_content" ||
        action === "file.read"
      ) {
        let rawRepo = String(p.repo || p.full_name || repo || "").trim();
        const targetRepo = await resolveRepo(rawRepo);
        const path = String(p.path || p.file || p.filepath || "").trim();

        if (!targetRepo || !targetRepo.includes("/") || !path) {
          throw new Error("Requer parâmetros 'repo' (dono/repo) e 'path' (ex: package.json ou src/App.tsx).");
        }

        const ref = p.ref || p.branch ? `?ref=${encodeURIComponent(String(p.ref || p.branch))}` : "";
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/contents/${path}${ref}`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));

        const data = await res.json();
        if (Array.isArray(data)) {
          return {
            success: true,
            data,
            summary: `📁 **O caminho '${path}' é uma pasta com ${data.length} itens:**\n` +
              data.map((item: any) => `• [${item.type}] ${item.name} (${item.path})`).join("\n"),
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
          summary: `📄 **Ficheiro \`${data.path}\` em [${targetRepo}](${data.html_url}) (${data.size} bytes):**\n\n\`\`\`\n${content.slice(0, 4000)}${content.length > 4000 ? "\n... (conteúdo truncado)" : ""}\n\`\`\``,
        };
      }

      // 5. repos.fork
      if (action === "repos.fork" || action === "fork_repo") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/repo'.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/forks`, {
          method: "POST",
          headers,
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🍴 **Fork Criado com Sucesso:** [${data.full_name}](${data.html_url}) a partir de ${targetRepo}`,
        };
      }

      // 6. contents.write_file
      if (action === "contents.write_file" || action === "write_file" || action === "file.write") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        const path = String(p.path || p.file || "").trim();
        const content = String(p.content ?? "");
        const message = String(p.message || `Update ${path} via GRIOT`);
        const branch = p.branch ? String(p.branch) : undefined;
        let sha = p.sha ? String(p.sha) : undefined;

        if (!targetRepo.includes("/") || !path) {
          throw new Error("Parâmetros 'repo' (dono/repo) e 'path' são obrigatórios.");
        }

        // Se SHA não fornecido, tenta buscar ficheiro existente para obter SHA atual
        if (!sha) {
          try {
            const checkRes = await safeFetch(`https://api.github.com/repos/${targetRepo}/contents/${path}${branch ? `?ref=${branch}` : ""}`, { headers });
            if (checkRes.ok) {
              const fileMeta = await checkRes.json();
              if (fileMeta?.sha) sha = fileMeta.sha;
            }
          } catch {
            // Ficheiro novo
          }
        }

        let base64Content = "";
        try {
          base64Content = Buffer.from(content, "utf-8").toString("base64");
        } catch {
          base64Content = btoa(unescape(encodeURIComponent(content)));
        }

        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/contents/${path}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            content: base64Content,
            branch,
            sha,
          }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `📝 **Ficheiro Gravado no GitHub:** \`${path}\` em [${targetRepo}](https://github.com/${targetRepo})
• Commit: [${data.commit?.sha?.slice(0, 7)}](${data.commit?.html_url})`,
        };
      }

      // 7. contents.delete_file
      if (action === "contents.delete_file" || action === "delete_file" || action === "file.delete") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        const path = String(p.path || p.file || "").trim();
        const message = String(p.message || `Delete ${path} via GRIOT`);
        const branch = p.branch ? String(p.branch) : undefined;
        let sha = p.sha ? String(p.sha) : undefined;

        if (!targetRepo.includes("/") || !path) throw new Error("Parâmetros 'repo' e 'path' são obrigatórios.");
        if (!sha) {
          const checkRes = await safeFetch(`https://api.github.com/repos/${targetRepo}/contents/${path}${branch ? `?ref=${branch}` : ""}`, { headers });
          if (!checkRes.ok) throw new Error("Não foi possível encontrar o ficheiro para apagar.");
          const fileMeta = await checkRes.json();
          sha = fileMeta.sha;
        }

        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/contents/${path}`, {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ message, sha, branch }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🗑️ **Ficheiro Apagado no GitHub:** \`${path}\` em ${targetRepo}`,
        };
      }

      // 8. contents.get_tree
      if (action === "contents.get_tree" || action === "get_tree" || action === "tree") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const branchOrSha = String(p.sha || p.branch || p.ref || "HEAD");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/git/trees/${branchOrSha}?recursive=1`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        const tree = (data.tree || []).slice(0, 80);
        return {
          success: true,
          data,
          summary: `🌲 **Árvore de Ficheiros (${data.tree?.length || 0} itens em ${targetRepo} @ ${branchOrSha}):**\n` +
            tree.map((t: any) => `• [${t.type}] \`${t.path}\``).join("\n") +
            (data.tree?.length > 80 ? "\n... (truncado)" : ""),
        };
      }

      // 9. search.code
      if (action === "search.code" || action === "search_code") {
        const query = String(p.query || p.q || "").trim();
        if (!query) throw new Error("Parâmetro 'query' ou 'q' é obrigatório.");
        const targetRepo = repo ? await resolveRepo(repo) : "";
        const fullQ = targetRepo ? `${query} repo:${targetRepo}` : query;
        const res = await safeFetch(`https://api.github.com/search/code?q=${encodeURIComponent(fullQ)}&per_page=15`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🔍 **Busca de Código no GitHub (${data.total_count} resultados):**\n` +
            (data.items || []).map((it: any) => `• [${it.path}](${it.html_url}) em ${it.repository?.full_name}`).join("\n"),
        };
      }

      // 10. branches.list
      if (action === "branches.list" || action === "list_branches" || action === "branches") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/branches?per_page=30`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const branches = await res.json();
        return {
          success: true,
          data: branches,
          summary: `🌿 **Branches em ${targetRepo} (${branches.length}):**\n` +
            branches.map((b: any) => `• \`${b.name}\` ${b.protected ? "🛡️ (Protegido)" : ""} [${b.commit?.sha?.slice(0, 7)}]`).join("\n"),
        };
      }

      // 11. branches.create
      if (action === "branches.create" || action === "create_branch") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const branchName = String(p.branch || p.name || "").trim();
        let sha = String(p.sha || "").trim();
        if (!branchName) throw new Error("Parâmetro 'branch' obrigatório.");
        if (!sha) {
          const repoRes = await safeFetch(`https://api.github.com/repos/${targetRepo}`, { headers });
          if (repoRes.ok) {
            const rData = await repoRes.json();
            const defBranch = rData.default_branch || "main";
            const bRes = await safeFetch(`https://api.github.com/repos/${targetRepo}/branches/${defBranch}`, { headers });
            if (bRes.ok) {
              const bData = await bRes.json();
              sha = bData.commit?.sha;
            }
          }
        }
        if (!sha) throw new Error("Não foi possível obter SHA de referência para criar branch.");

        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/git/refs`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🌿 **Novo Branch Criado:** \`${branchName}\` a partir de \`${sha.slice(0, 7)}\` em ${targetRepo}`,
        };
      }

      // 12. branches.merge
      if (action === "branches.merge" || action === "merge_branch") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const base = String(p.base || "main");
        const head = String(p.head || "").trim();
        if (!head) throw new Error("Parâmetro 'head' é obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/merges`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ base, head, commit_message: p.commit_message || undefined }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🔀 **Merge Concluído:** \`${head}\` fundido em \`${base}\` no repositório ${targetRepo}`,
        };
      }

      // 13. pulls.list
      if (action === "pulls.list" || action === "list_prs" || action === "prs" || action === "pulls") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/repo'.");
        const state = String(p.state || "open");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/pulls?state=${state}&per_page=15`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const prs = (await res.json()) as Array<{
          number: number;
          title: string;
          state: string;
          html_url: string;
          user: { login: string };
          created_at: string;
          head: { ref: string };
          base: { ref: string };
        }>;
        return {
          success: true,
          data: prs,
          summary: prs.length
            ? `🔀 **Pull Requests em [${targetRepo}](https://github.com/${targetRepo}/pulls) (${state}):**\n` +
              prs.map((pr) => `• **[#${pr.number} ${pr.title}](${pr.html_url})** por @${pr.user.login} (\`${pr.head.ref}\` → \`${pr.base.ref}\`)`).join("\n")
            : `Nenhum Pull Request (${state}) encontrado em **${targetRepo}**.`,
        };
      }

      // 14. pulls.create
      if (action === "pulls.create" || action === "create_pr" || action === "create_pull") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const title = String(p.title || "").trim();
        const head = String(p.head || "").trim();
        const base = String(p.base || "main").trim();
        if (!title || !head) throw new Error("Parâmetros 'title' e 'head' são obrigatórios para abrir PR.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/pulls`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title, head, base, body: p.body || "" }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🔀 **Pull Request Aberto:** [#${data.number} ${data.title}](${data.html_url})
• ` + `\`${head}\` → \`${base}\``,
        };
      }

      // 15. pulls.get_diff
      if (action === "pulls.get_diff" || action === "get_diff" || action === "pr_diff") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const pullNumber = p.pull_number || p.number || p.pr;
        if (!pullNumber) throw new Error("Parâmetro 'pull_number' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/pulls/${pullNumber}`, {
          headers: { ...headers, Accept: "application/vnd.github.v3.diff" },
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const diff = await res.text();
        return {
          success: true,
          data: { diff },
          summary: `📄 **Git Diff do PR #${pullNumber} (${targetRepo}):**\n\`\`\`diff\n${diff.slice(0, 4000)}${diff.length > 4000 ? "\n... (truncado)" : ""}\n\`\`\``,
        };
      }

      // 16. pulls.merge
      if (action === "pulls.merge" || action === "merge_pr") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const pullNumber = p.pull_number || p.number || p.pr;
        if (!pullNumber) throw new Error("Parâmetro 'pull_number' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/pulls/${pullNumber}/merge`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            commit_title: p.commit_title || undefined,
            merge_method: p.merge_method || "merge",
          }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `✅ **Pull Request #${pullNumber} Merged com Sucesso no GitHub!** (${data.message})`,
        };
      }

      // 17. issues.list
      if (action === "issues.list" || action === "list_issues" || action === "issues") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/repo'.");
        const state = String(p.state || "open");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/issues?state=${state}&per_page=15`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const issues = (await res.json()) as Array<{
          number: number;
          title: string;
          state: string;
          html_url: string;
          user: { login: string };
          comments: number;
        }>;
        return {
          success: true,
          data: issues,
          summary: issues.length
            ? `🐛 **Issues em [${targetRepo}](https://github.com/${targetRepo}/issues) (${state}):**\n` +
              issues.map((i) => `• **[#${i.number} ${i.title}](${i.html_url})** por @${i.user.login} (${i.comments} comentários)`).join("\n")
            : `Nenhuma Issue (${state}) encontrada em **${targetRepo}**.`,
        };
      }

      // 18. issues.create
      if (action === "issues.create" || action === "create_issue") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório no formato 'dono/repo'.");
        const title = String(p.title || p.name || "").trim();
        if (!title) throw new Error("Parâmetro 'title' é obrigatório para criar issue.");
        const body = String(p.body || p.description || "");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/issues`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const issue = await res.json();
        return {
          success: true,
          data: issue,
          summary: `🐛 **Issue Criada:** [#${issue.number} ${issue.title}](${issue.html_url}) em ${targetRepo}`,
        };
      }

      // 19. issues.comment
      if (action === "issues.comment" || action === "comment_issue" || action === "add_comment") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const issueNumber = p.issue_number || p.number || p.id;
        const body = String(p.body || p.content || "").trim();
        if (!issueNumber || !body) throw new Error("Parâmetros 'issue_number' e 'body' são obrigatórios.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/issues/${issueNumber}/comments`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `💬 **Comentário publicado na Issue #${issueNumber} de ${targetRepo}!**`,
        };
      }

      // 20. issues.close
      if (action === "issues.close" || action === "close_issue") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const issueNumber = p.issue_number || p.number || p.id;
        if (!issueNumber) throw new Error("Parâmetro 'issue_number' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/issues/${issueNumber}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ state: "closed", state_reason: p.reason || "completed" }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `🔒 **Issue #${issueNumber} fechada com sucesso em ${targetRepo}!**`,
        };
      }

      // 21. commits.list
      if (action === "commits.list" || action === "list_commits" || action === "commits") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/commits?per_page=10`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const commits = await res.json();
        return {
          success: true,
          data: commits,
          summary: `📝 **Últimos Commits em [${targetRepo}](https://github.com/${targetRepo}/commits):**\n` +
            (commits || []).map((c: any) => `• [\`${c.sha.slice(0, 7)}\`](${c.html_url}) ${c.commit.message.split("\n")[0]} — _${c.commit.author.name}_`).join("\n"),
        };
      }

      // 22. actions.list_workflows
      if (action === "actions.list_workflows" || action === "workflows") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/actions/workflows`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        const wfs = data.workflows || [];
        return {
          success: true,
          data,
          summary: `⚙️ **Workflows do GitHub Actions em ${targetRepo} (${wfs.length}):**\n` +
            wfs.map((w: any) => `• **[${w.name}](${w.html_url})** [Estado: ${w.state}] (ID: ${w.id})`).join("\n"),
        };
      }

      // 23. actions.trigger_dispatch
      if (action === "actions.trigger_dispatch" || action === "dispatch_workflow") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const workflowId = p.workflow_id || p.workflow;
        const ref = String(p.ref || "main");
        if (!workflowId) throw new Error("Parâmetro 'workflow_id' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/actions/workflows/${workflowId}/dispatches`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ ref, inputs: p.inputs || {} }),
        });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        return {
          success: true,
          summary: `🚀 **GitHub Actions Dispatch Acionado com Sucesso!** Workflow: ${workflowId} no branch \`${ref}\`.`,
        };
      }

      // 24. actions.get_run_jobs
      if (action === "actions.get_run_jobs" || action === "run_jobs") {
        const targetRepo = await resolveRepo(String(p.repo || p.full_name || repo || "").trim());
        if (!targetRepo.includes("/")) throw new Error("Parâmetro 'repo' obrigatório.");
        const runId = p.run_id || p.run;
        if (!runId) throw new Error("Parâmetro 'run_id' obrigatório.");
        const res = await safeFetch(`https://api.github.com/repos/${targetRepo}/actions/runs/${runId}/jobs`, { headers });
        if (!res.ok) throw new Error(await handleHttpError(res, "GitHub"));
        const data = await res.json();
        return {
          success: true,
          data,
          summary: `⚙️ **Jobs da Run #${runId} no GitHub Actions (${data.total_count} jobs):**\n` +
            (data.jobs || []).map((j: any) => `• ${j.status === "completed" ? (j.conclusion === "success" ? "✅" : "❌") : "🔄"} **${j.name}** [${j.status} - ${j.conclusion || "em curso"}]`).join("\n"),
        };
      }

      // 25. Perfil de Utilizador (user / profile / account / default)
      if (
        action === "profile" ||
        action === "user" ||
        action === "get_user" ||
        action === "account" ||
        action === "default" ||
        !action
      ) {
        const userRes = await safeFetch("https://api.github.com/user", { headers });
        if (!userRes.ok) throw new Error(await handleHttpError(userRes, "GitHub"));
        const user = await userRes.json();
        const scopes = userRes.headers.get("x-oauth-scopes");

        let scopeDetails = "";
        if (scopes !== null) {
          const scopesArr = scopes.split(",").map((s) => s.trim().toLowerCase());
          const hasRepo = scopesArr.includes("repo") || scopesArr.includes("public_repo");
          if (!hasRepo) {
            scopeDetails = `\n\n⚠️ **Alerta de Permissões:** O token conectado **NÃO possui o escopo 'repo'** (escopos ativos: \`${scopes || "nenhum"}\`). Repositórios privados estarão invisíveis e a criação/edição de código será bloqueada pelo GitHub.\n👉 Ativa o escopo **'repo'** em [github.com/settings/tokens](https://github.com/settings/tokens).`;
          } else {
            scopeDetails = `\n\n✅ **Permissões do Token:** Escopos ativos: \`${scopes}\` (acesso a repositórios ativo).`;
          }
        }

        return {
          success: true,
          data: { ...user, scopes },
          summary:
            `🐙 **Conta GitHub Conectada com Sucesso!**\n` +
            `• Utilizador: **[@${user.login}](${user.html_url})** (${user.name || "Sem nome público"})\n` +
            `• Email: ${user.email || "Privado"}\n` +
            `• Repositórios: ${user.public_repos} públicos | ${user.total_private_repos ?? 0} privados\n` +
            `• Bio: ${user.bio || "Sem biografia"}` +
            scopeDetails +
            `\n\n💡 _Podes pedir: "Griot, lista os meus repositórios", "Cria um repositório chamado meu-app" ou "Mostra os PRs de dono/repo"_`,
        };
      }

      // Se a ação não é conhecida, lança erro explicativo em vez de devolver silenciosamente o perfil
      throw new Error(
        `Ação '${action}' não reconhecida para o conector GitHub. Ações disponíveis: repos.list, repos.get, repos.create, contents.read_file, contents.write_file, contents.delete_file, branches.list, pulls.list, issues.list, user/profile.`
      );
    } catch (err: any) {
      return { success: false, error: err.message, summary: `❌ **Erro no GitHub:** ${err.message}` };
    }
  }

  // =========================================================================
  // 2. GITLAB
  // =========================================================================
  if (normId === "gitlab") {
    const gitlabAction =
      action === "projects.list" ||
      action === "projectlist" ||
      action === "projects_list" ||
      action === "project_list" ||
      action === "list_projects" ||
      action === "listprojects" ||
      action === "projects" ||
      action === "repos.list" ||
      action === "list_repos" ||
      action === "repos" ||
      action === "list"
        ? "list_projects"
        : action === "projects.get" ||
          action === "get_project" ||
          action === "project_details" ||
          action === "project" ||
          action === "repos.get" ||
          action === "get_repo" ||
          action === "repo"
        ? "get_project"
        : action === "pipelines.list" ||
          action === "list_pipelines" ||
          action === "pipelines" ||
          action === "actions.list_runs" ||
          action === "runs"
        ? "list_pipelines"
        : action === "repository.get_raw_file" ||
          action === "get_raw_file" ||
          action === "read_file" ||
          action === "contents.read_file" ||
          action === "file.read" ||
          action === "get_file"
        ? "get_raw_file"
        : action === "repository.tree" ||
          action === "tree" ||
          action === "get_tree" ||
          action === "list_files" ||
          action === "files.list" ||
          action === "contents.get_tree" ||
          action === "contents.tree"
        ? "tree"
        : action === "merge_requests.list" ||
          action === "list_merge_requests" ||
          action === "merge_requests" ||
          action === "pulls.list" ||
          action === "list_prs" ||
          action === "prs"
        ? "list_merge_requests"
        : action === "issues.list" || action === "list_issues" || action === "issues"
        ? "list_issues"
        : action === "issues.create" || action === "create_issue"
        ? "create_issue"
        : action === "user" || action === "profile" || action === "get_user" || action === "account"
        ? "get_user"
        : rawAction;
    return executeBatch1Connector("gitlab", { ...ctx, action: gitlabAction });
  }

  // =========================================================================
  // 3. VERCEL
  // =========================================================================
  if (normId === "vercel") {
    const vercelAction =
      action === "projects.list" ? "list_projects" :
      action === "projects.get" ? "get_project" :
      action === "deployments.list" ? "list_deployments" :
      action === "deployments.get" ? "get_deployment" :
      action === "deployments.create" ? "create_deployment" :
      action === "env.list" ? "list_env" :
      action === "domains.list" ? "list_domains" :
      action === "user" || action === "profile" ? "get_user" :
      rawAction;
    return executeBatch1Connector("vercel", { ...ctx, action: vercelAction });
  }

  // =========================================================================
  // 4. SUPABASE
  // =========================================================================
  if (normId === "supabase") {
    const sbAction =
      action === "db.raw_sql" || action === "raw_sql" || action === "query" || action === "sql" ? "execute_sql" :
      action === "db.select" || action === "select" ? "select" :
      action === "db.insert" || action === "insert" ? "insert" :
      action === "db.introspect_schema" || action === "list_tables" ? "list_tables" :
      action === "storage.list_buckets" || action === "list_buckets" ? "list_buckets" :
      action === "functions.list" || action === "list_functions" ? "list_functions" :
      action === "projects.list" ? "list_projects" :
      rawAction;
    return executeBatch1Connector("supabase", { ...ctx, action: sbAction });
  }

  // =========================================================================
  // 5. FIREBASE
  // =========================================================================
  if (normId === "firebase") {
    const fbAction =
      action === "firestore.get_document" || action === "get_document" ? "get_document" :
      action === "firestore.list_documents" || action === "list_documents" ? "list_documents" :
      action === "firestore.set_document" || action === "set_document" || action === "create_document" ? "create_document" :
      action === "firestore.delete_document" || action === "delete_document" ? "delete_document" :
      rawAction;
    return executeBatch1Connector("firebase", { ...ctx, action: fbAction });
  }

  return executeBatch1Connector(normId, ctx);
}
