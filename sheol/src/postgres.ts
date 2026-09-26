import { sha256 } from './hash.js';
import type { Artifact, EventRecord, GateResult, MissionSnapshot } from './domain.js';
import type { MissionPersistence } from './persistence.js';

export interface SqlQueryResult<T extends Record<string, unknown>> { readonly rows: readonly T[]; }
export interface SqlExecutor { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<SqlQueryResult<T>>; }
export interface SqlTransactionalExecutor extends SqlExecutor { transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>; }

export class PostgresEventStore {
  public constructor(private readonly db: SqlExecutor) {}
  public async append(event: EventRecord): Promise<void> {
    await this.db.query(
      `insert into private.sheol_events (event_id, mission_id, phase_id, attempt_id, type, data, occurred_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz) on conflict (event_id) do nothing`,
      [event.id, event.missionId, event.phaseId ?? null, event.attemptId ?? null, event.type, JSON.stringify(event.data), event.timestamp],
    );
  }
  public async list(missionId: string): Promise<readonly EventRecord[]> {
    const result = await this.db.query<{event_id:string;mission_id:string;phase_id:string|null;attempt_id:string|null;type:string;data:Record<string,unknown>;occurred_at:string}>(
      `select event_id, mission_id, phase_id, attempt_id, type, data, occurred_at from private.sheol_events where mission_id = $1 order by sequence_no asc`, [missionId]);
    return result.rows.map(row => ({id:row.event_id,type:row.type,missionId:row.mission_id,...(row.phase_id?{phaseId:row.phase_id}:{}),...(row.attempt_id?{attemptId:row.attempt_id}:{}),timestamp:row.occurred_at,data:row.data}));
  }
}

export class PostgresArtifactStore {
  public constructor(private readonly db: SqlExecutor) {}
  public async put(artifact: Artifact): Promise<void> {
    await this.db.query(
      `insert into private.sheol_artifacts
       (artifact_id, mission_id, phase_id, attempt_id, path, version, content_sha256, content_text, metadata, committed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       on conflict (artifact_id) do update set content_sha256=excluded.content_sha256, content_text=excluded.content_text, metadata=excluded.metadata, committed=excluded.committed`,
      [artifact.id,artifact.missionId,artifact.phaseId,artifact.attemptId,artifact.path,artifact.version,artifact.sha256,artifact.content,'{}',artifact.committed]);
  }
  public async get(id:string):Promise<Artifact|null>{
    const r=await this.db.query<{artifact_id:string;mission_id:string;phase_id:string;attempt_id:string;path:string;version:number;content_sha256:string;content_text:string|null;committed:boolean}>(
      `select artifact_id,mission_id,phase_id,attempt_id,path,version,content_sha256,content_text,committed from private.sheol_artifacts where artifact_id=$1`,[id]);
    const row=r.rows[0]; if(!row)return null;
    return {id:row.artifact_id,missionId:row.mission_id,phaseId:row.phase_id,attemptId:row.attempt_id,path:row.path,version:row.version,sha256:row.content_sha256,content:row.content_text??'',committed:row.committed};
  }
  public async listByMission(missionId:string):Promise<readonly Artifact[]>{
    const r=await this.db.query<{artifact_id:string;mission_id:string;phase_id:string;attempt_id:string;path:string;version:number;content_sha256:string;content_text:string|null;committed:boolean}>(
      `select artifact_id,mission_id,phase_id,attempt_id,path,version,content_sha256,content_text,committed from private.sheol_artifacts where mission_id=$1 order by path asc,version asc`,[missionId]);
    return r.rows.map(row=>({id:row.artifact_id,missionId:row.mission_id,phaseId:row.phase_id,attemptId:row.attempt_id,path:row.path,version:row.version,sha256:row.content_sha256,content:row.content_text??'',committed:row.committed}));
  }
}

function gatePersistenceId(missionId: string, gate: GateResult): string {
  return sha256(JSON.stringify([missionId, gate.attemptId ?? '', gate.phaseId ?? '', gate.gateId, gate.status, gate.reasons, gate.evidence]));
}

export class PostgresMissionPersistence implements MissionPersistence {
  public constructor(private readonly db: SqlTransactionalExecutor) {}
  public async persist(snapshot: MissionSnapshot, newEvents: readonly EventRecord[] = []): Promise<void> {
    await this.db.transaction(async tx => {
      const planVersion = snapshot.plan?.version ?? null;
      await tx.query(
        `insert into private.sheol_missions (mission_id,owner_user_id,state,constitution_hash,constitution,active_plan_version)
         values ($1,$2,$3,$4,$5::jsonb,$6)
         on conflict (mission_id) do update set owner_user_id=excluded.owner_user_id,state=excluded.state,constitution_hash=excluded.constitution_hash,constitution=excluded.constitution,active_plan_version=excluded.active_plan_version,updated_at=now()`,
        [snapshot.constitution.missionId, null, snapshot.state, snapshot.constitution.hash, JSON.stringify(snapshot.constitution), planVersion]);

      for (const plan of snapshot.planHistory) {
        await tx.query(`insert into private.sheol_plans (mission_id,plan_version,plan) values ($1,$2,$3::jsonb) on conflict (mission_id,plan_version) do update set plan=excluded.plan`,
          [snapshot.constitution.missionId, plan.version, JSON.stringify(plan)]);
      }

      if (snapshot.plan) {
        for (const phase of snapshot.plan.phases) {
          const attemptCount = snapshot.attempts.filter(a => a.phaseId === phase.id).length;
          const activeAttemptId = snapshot.activePhaseId === phase.id ? snapshot.activeAttemptId : null;
          await tx.query(
            `insert into private.sheol_phases (phase_id,mission_id,plan_version,phase_key,order_index,state,contract,active_attempt_id,attempt_count)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
             on conflict (phase_id) do update set plan_version=excluded.plan_version,phase_key=excluded.phase_key,order_index=excluded.order_index,state=excluded.state,contract=excluded.contract,active_attempt_id=excluded.active_attempt_id,attempt_count=excluded.attempt_count,updated_at=now()`,
            [phase.id,snapshot.constitution.missionId,snapshot.plan.version,phase.id,snapshot.plan.phases.indexOf(phase),snapshot.phaseStates[phase.id] ?? 'LOCKED',JSON.stringify(phase),activeAttemptId,attemptCount]);
        }
      }

      for (const attempt of snapshot.attempts) {
        await tx.query(
          `insert into private.sheol_attempts (attempt_id,mission_id,phase_id,attempt_no,state,model_id,request,result,started_at,finished_at,committed_at)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::timestamptz,$10::timestamptz,$11::timestamptz)
           on conflict (attempt_id) do update set state=excluded.state,model_id=excluded.model_id,request=excluded.request,result=excluded.result,finished_at=excluded.finished_at,committed_at=excluded.committed_at`,
          [attempt.id,attempt.missionId,attempt.phaseId,attempt.attemptNo,attempt.state,attempt.modelId??null,attempt.request===undefined?null:JSON.stringify(attempt.request),attempt.result===undefined?null:JSON.stringify(attempt.result),attempt.startedAt,attempt.finishedAt??null,attempt.committedAt??null]);
      }

      for (const artifact of snapshot.artifacts) {
        await tx.query(
          `insert into private.sheol_artifacts (artifact_id,mission_id,phase_id,attempt_id,path,version,content_sha256,content_text,metadata,committed)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb,$9)
           on conflict (artifact_id) do update set content_sha256=excluded.content_sha256,content_text=excluded.content_text,committed=excluded.committed`,
          [artifact.id,artifact.missionId,artifact.phaseId,artifact.attemptId,artifact.path,artifact.version,artifact.sha256,artifact.content,artifact.committed]);
      }

      for (const gate of snapshot.gateResults) {
        await tx.query(
          `insert into private.sheol_gates (gate_result_id,mission_id,phase_id,attempt_id,gate_id,status,reasons,evidence)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
           on conflict (gate_result_id) do update set status=excluded.status,reasons=excluded.reasons,evidence=excluded.evidence`,
          [gatePersistenceId(snapshot.constitution.missionId,gate),snapshot.constitution.missionId,gate.phaseId??null,gate.attemptId??null,gate.gateId,gate.status,JSON.stringify(gate.reasons),JSON.stringify(gate.evidence)]);
      }

      for (const capsule of snapshot.capsules) {
        await tx.query(`insert into private.sheol_capsules (capsule_id,mission_id,phase_id,capsule) values ($1,$2,$3,$4::jsonb) on conflict (phase_id) do update set capsule=excluded.capsule`,
          [sha256(JSON.stringify([snapshot.constitution.missionId,capsule.phaseId,capsule.artifactRefs])),snapshot.constitution.missionId,capsule.phaseId,JSON.stringify(capsule)]);
      }

      for (const replan of snapshot.replans) {
        await tx.query(`insert into private.sheol_replans (replan_id,mission_id,from_plan_version,to_plan_version,reason,evidence,proposed_plan,accepted) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) on conflict (replan_id) do update set accepted=excluded.accepted`,
          [replan.id,replan.missionId,replan.fromPlanVersion,replan.toPlanVersion,replan.reason,JSON.stringify(replan.evidence),JSON.stringify(replan.proposedPlan),replan.accepted]);
      }

      for (const event of newEvents) {
        await tx.query(`insert into private.sheol_events (event_id,mission_id,phase_id,attempt_id,type,data,occurred_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) on conflict (event_id) do nothing`,
          [event.id,event.missionId,event.phaseId??null,event.attemptId??null,event.type,JSON.stringify(event.data),event.timestamp]);
      }
    });
  }
}

export class PostgresMissionSnapshotStore extends PostgresMissionPersistence {}
