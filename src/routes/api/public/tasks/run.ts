import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Executor de tarefas de projeto no servidor.
 * Chamado periodicamente pelo agendador (cron). Corre tarefas pendentes/agendadas
 * mesmo com a app fechada e guarda o resultado no OPB do projeto.
 */

type TaskMeta = {
  instruction?: string;
  runAtTime?: string;
  runAtDate?: string;
  repeat?: "once" | "daily" | "weekly" | "monthly";
};

function parseMeta(title: string): TaskMeta | null {
  if (!title.startsWith("{")) return null;
  try {
    return JSON.parse(title) as TaskMeta;
  } catch {
    return null;
  }
}

function dueAt(meta: TaskMeta | null, createdAt: string): Date {
  if (!meta?.runAtTime) return new Date(createdAt);
  const date = meta.runAtDate || new Date().toISOString().slice(0, 10);
  const d = new Date(
    `${date}T${meta.runAtTime.length === 5 ? meta.runAtTime + ":00" : meta.runAtTime}Z`,
  );
  return Number.isNaN(d.getTime()) ? new Date(createdAt) : d;
}

function nextDate(meta: TaskMeta, from: Date): string | null {
  const d = new Date(from);
  if (meta.repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (meta.repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (meta.repeat === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/tasks/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateContentWithFallback } = await import("@/lib/gemini.server");
        const db = supabaseAdmin as any;

        const { data: tasks, error } = await db
          .from("griot_studio_tasks")
          .select("id, workspace_id, project_id, created_by, title, status, created_at")
          .in("status", ["todo", "scheduled"])
          .order("created_at", { ascending: true })
          .limit(10);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const now = new Date();
        const results: Array<{ id: string; status: string }> = [];

        for (const task of tasks ?? []) {
          const meta = parseMeta(String(task.title));
          // Tarefas "todo" simples sem payload autónomo são listas manuais: não executar.
          if (!meta?.instruction) continue;
          const due = dueAt(meta, task.created_at);
          if (due > now) continue;

          // Reserva atómica: só um executor apanha a tarefa.
          const { data: claimed } = await db
            .from("griot_studio_tasks")
            .update({ status: "running", updated_at: now.toISOString() })
            .eq("id", task.id)
            .eq("status", task.status)
            .select("id")
            .maybeSingle();
          if (!claimed) continue;

          let finalStatus = "completed";
          let output = "";
          try {
            const { result } = await generateContentWithFallback({
              contents: [{ role: "user", parts: [{ text: meta.instruction }] }],
              config: {
                systemInstruction:
                  "És o GRIOT a executar uma tarefa de projeto em segundo plano. Responde com o resultado final, claro e acionável, em português.",
              },
            });
            output = result.text ?? "";
          } catch (err) {
            finalStatus = "failed";
            output = err instanceof Error ? err.message : "Falha na execução";
          }

          await db.from("griot_opb_events").insert({
            workspace_id: task.workspace_id,
            project_id: task.project_id,
            actor_id: task.created_by,
            event_type: finalStatus === "completed" ? "task.completed" : "task.failed",
            payload: {
              task_id: task.id,
              instruction: meta.instruction,
              output: output.slice(0, 20000),
            },
          });

          if (finalStatus === "completed") {
            await db.rpc("griot_gcu_meter_event", {
              p_workspace_id: task.workspace_id,
              p_user_id: task.created_by,
              p_idempotency_key: `task-${task.id}-${due.toISOString()}`,
              p_component: "griot-task-runner",
              p_operation: "Tarefa de projeto",
              p_metrics: { gcu: 2 },
            });
          }

          const repeatDate = finalStatus === "completed" ? nextDate(meta, due) : null;
          await db
            .from("griot_studio_tasks")
            .update(
              repeatDate
                ? {
                    status: "scheduled",
                    title: JSON.stringify({ ...meta, runAtDate: repeatDate }),
                    updated_at: new Date().toISOString(),
                  }
                : { status: finalStatus, updated_at: new Date().toISOString() },
            )
            .eq("id", task.id);

          results.push({ id: task.id, status: repeatDate ? "rescheduled" : finalStatus });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
