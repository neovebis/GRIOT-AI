/**
 * GRIOT Action & Command Parser
 * Extracts structured actions (fs, git, shell, test) from streaming or complete AI text.
 */

import { GriotAction, GriotActionType, GriotActionCategory, RiskLevel } from "./protocol";

function stableActionId(rawBlock: string): string {
  let hash = 2166136261;
  for (let i = 0; i < rawBlock.length; i++) {
    hash ^= rawBlock.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `act_${(hash >>> 0).toString(36)}`;
}

function calculateRisk(type: GriotActionType, params: Record<string, unknown>): RiskLevel {
  if (
    type === "fs.read_tree" ||
    type === "fs.read_file" ||
    type === "git.status" ||
    type === "git.log" ||
    type === "opb.recall" ||
    type === "search.code" ||
    type === "search.files" ||
    type === "code.diagnose" ||
    type === "code.find_symbol" ||
    type === "code.index_symbols"
  ) {
    return "safe";
  }

  if (type === "shell.exec") {
    const cmd = String(params.command || "")
      .trim()
      .toLowerCase();
    if (
      cmd.includes("rm -rf /") ||
      cmd.includes("mkfs") ||
      cmd.includes(":(){ :|:& };:") ||
      cmd.includes("dd if=") ||
      cmd.includes("chmod -r 777 /")
    ) {
      return "dangerous";
    }
    if (cmd.includes("git push --force") || cmd.includes("git reset --hard")) {
      return "dangerous";
    }
    return "sensitive";
  }

  if (type === "git.push") {
    if (
      Boolean(params.force) ||
      String(params.branch || "").includes("main") ||
      String(params.branch || "").includes("master")
    ) {
      return "sensitive";
    }
    return "sensitive";
  }

  if (type === "fs.delete_file") {
    return "sensitive";
  }

  if (
    type === "fs.write_file" ||
    type === "fs.patch" ||
    type === "shell.install" ||
    type === "test.run"
  ) {
    return "sensitive";
  }

  return "safe";
}

export function parseGriotActions(text: string): GriotAction[] {
  const actions: GriotAction[] = [];
  if (!text) return actions;

  // 1. Tag-based XML format: <griot_action type="shell.exec">...</griot_action>
  const tagRegex =
    /<griot_action\s+type=["']([^"']+)["'](?:\s+path=["']([^"']*)["'])?>([\s\S]*?)<\/griot_action>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    let typeStr = match[1].trim() as GriotActionType;
    const lowerType = String(typeStr).toLowerCase();
    if (
      lowerType === "projectlist" ||
      lowerType === "project_list" ||
      lowerType === "list_projects" ||
      lowerType === "projects"
    ) {
      typeStr = "project.list";
    }
    const pathAttr = match[2]?.trim();
    const body = match[3]?.trim();

    let params: Record<string, unknown> = {};
    if (pathAttr) params.path = pathAttr;

    // Check if body is XML/JSON or plain text command
    if (body.startsWith("{") && body.endsWith("}")) {
      try {
        params = { ...params, ...(JSON.parse(body) as Record<string, unknown>) };
      } catch {
        params.content = body;
      }
    } else {
      // Subtag parsing (e.g., <command>npm install</command> or <content>...</content>)
      const cmdMatch = body.match(/<command>([\s\S]*?)<\/command>/i);
      const contentMatch = body.match(/<content>([\s\S]*?)<\/content>/i);
      const pathMatch = body.match(/<path>([\s\S]*?)<\/path>/i);
      const branchMatch = body.match(/<branch>([\s\S]*?)<\/branch>/i);
      const messageMatch = body.match(/<message>([\s\S]*?)<\/message>/i);

      if (cmdMatch) params.command = cmdMatch[1].trim();
      if (contentMatch) params.content = contentMatch[1];
      if (pathMatch) params.path = pathMatch[1].trim();
      if (branchMatch) params.branch = branchMatch[1].trim();
      if (messageMatch) params.message = messageMatch[1].trim();

      if (!cmdMatch && !contentMatch && !pathMatch && body) {
        if (typeStr.startsWith("shell.") || typeStr.startsWith("test.")) {
          params.command = body;
        } else if (typeStr.startsWith("fs.")) {
          params.content = body;
        }
      }
    }

    const category = (typeStr.split(".")[0] || "shell") as GriotActionCategory;
    const risk = calculateRisk(typeStr, params);

    actions.push({
      id: stableActionId(match[0]),
      type: typeStr,
      category,
      risk,
      params,
      rawBlock: match[0],
      requiresApproval: risk !== "safe",
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  // 2. Specialized codeblock tags: ```griot:shell npm install``` or ```griot:fs:write src/file.ts```
  const codeBlockRegex = /```griot:([a-z0-9_.-]+)(?::([^\n]+))?\n([\s\S]*?)```/gi;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const rawType = match[1].trim();
    const pathOrArg = match[2]?.trim();
    const content = match[3];

    let actionType: GriotActionType = "shell.exec";
    const params: Record<string, unknown> = {};

    if (
      rawType === "shell" ||
      rawType === "exec" ||
      rawType === "bash" ||
      rawType === "sh" ||
      rawType === "terminal"
    ) {
      actionType = "shell.exec";
      params.command = content.trim();
    } else if (rawType === "install") {
      actionType = "shell.install";
      params.package = pathOrArg || content.trim();
    } else if (rawType === "write" || rawType === "fs.write") {
      actionType = "fs.write_file";
      params.path = pathOrArg || "output.txt";
      params.content = content;
    } else if (rawType === "test") {
      actionType = "test.run";
      params.command = content.trim() || pathOrArg || "npm test";
    } else if (rawType === "git.commit") {
      actionType = "git.commit";
      params.message = content.trim() || pathOrArg || "Update";
    } else if (rawType === "opb" || rawType === "opb.recall" || rawType === "recall") {
      actionType = "opb.recall";
      params.query = content.trim() || pathOrArg || "";
    } else if (rawType === "projectlist" || rawType === "project_list" || rawType === "projects") {
      actionType = "project.list";
    } else if (rawType === "diagnose" || rawType === "code:diagnose" || rawType === "lint") {
      actionType = "code.diagnose";
    }

    const category = (actionType.split(".")[0] || "shell") as "fs" | "git" | "shell" | "test";
    const risk = calculateRisk(actionType, params);

    actions.push({
      id: stableActionId(match[0]),
      type: actionType,
      category,
      risk,
      params,
      rawBlock: match[0],
      requiresApproval: risk !== "safe",
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  // 3. Tag padronizada de conectores externos (Harness Level):
  // <connector_action connector="github" action="contents.write_file" params='{"repo":"user/app","path":"src/index.ts","content":"..."}' />
  // ou <connector_action connector="supabase" action="db.raw_sql">{"sql":"CREATE TABLE..."}</connector_action>
  const connectorActionRegex =
    /<connector_action\b([^>]*?)(?:\/>|>([\s\S]*?)<\/connector_action>)/gi;

  let connMatch: RegExpExecArray | null;
  while ((connMatch = connectorActionRegex.exec(text)) !== null) {
    const rawAttrs = connMatch[1] || "";
    const bodyContent = connMatch[2]?.trim() || "";

    const connectorMatch = rawAttrs.match(/connector=["']([^"']+)["']/i);
    const actionMatch = rawAttrs.match(/action=["']([^"']+)["']/i);
    const paramsAttrMatch = rawAttrs.match(/params=(?:'([\s\S]*?)'|"([\s\S]*?)")/i);

    const connector = connectorMatch ? connectorMatch[1].trim() : "";
    const action = actionMatch ? actionMatch[1].trim() : "default";

    let parsedParams: Record<string, unknown> = {};

    // Extrai do atributo params='...' se existir
    const rawParamsAttr = paramsAttrMatch ? (paramsAttrMatch[1] ?? paramsAttrMatch[2] ?? "") : "";
    if (rawParamsAttr) {
      try {
        const unescaped = rawParamsAttr
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        parsedParams = JSON.parse(unescaped) as Record<string, unknown>;
      } catch {
        parsedParams = { raw: rawParamsAttr };
      }
    }

    // Se o atributo não continha dados ou veio vazio, tenta o corpo da tag
    if (bodyContent && Object.keys(parsedParams).length === 0) {
      try {
        parsedParams = JSON.parse(bodyContent) as Record<string, unknown>;
      } catch {
        parsedParams = { raw: bodyContent };
      }
    }

    if (connector) {
      actions.push({
        id: stableActionId(connMatch[0]),
        type: "connector.execute",
        category: "connector",
        risk: "sensitive",
        params: {
          connector,
          action,
          params: parsedParams,
          ...parsedParams,
        },
        rawBlock: connMatch[0],
        requiresApproval: false,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 4. Tags diretas de terminal: <terminal>comando</terminal> ou <shell>comando</shell>
  const directTerminalRegex = /<(?:terminal|shell|bash)>([\s\S]*?)<\/(?:terminal|shell|bash)>/gi;
  let termMatch: RegExpExecArray | null;
  while ((termMatch = directTerminalRegex.exec(text)) !== null) {
    const cmd = termMatch[1].trim();
    if (cmd) {
      actions.push({
        id: stableActionId(termMatch[0]),
        type: "shell.exec",
        category: "shell",
        risk: calculateRisk("shell.exec", { command: cmd }),
        params: { command: cmd },
        rawBlock: termMatch[0],
        requiresApproval: false,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }
  }

  return actions;
}

export function stripActionBlocks(text: string): string {
  if (!text) return "";
  return text
    .replace(/<connector_action\b[\s\S]*?(?:\/>|<\/connector_action>)/gi, "")
    .replace(/<griot_action[\s\S]*?<\/griot_action>/gi, "")
    .replace(/<(?:terminal|shell|bash)>[\s\S]*?<\/(?:terminal|shell|bash)>/gi, "")
    .replace(/```griot:[\s\S]*?```/gi, "")
    .trim();
}
