import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Artifact, EventRecord, MissionSnapshot } from './domain.js';

export interface EventStore { append(event: EventRecord): Promise<void>; list(missionId: string): Promise<readonly EventRecord[]>; }
export interface ArtifactStore { put(artifact: Artifact): Promise<void>; get(id: string): Promise<Artifact | null>; listByMission(missionId: string): Promise<readonly Artifact[]>; }
export interface MissionPersistence { persist(snapshot: MissionSnapshot, newEvents: readonly EventRecord[]): Promise<void>; }

export class InMemoryEventStore implements EventStore {
  private readonly events: EventRecord[] = [];
  async append(event: EventRecord): Promise<void> { this.events.push(structuredClone(event)); }
  async list(missionId: string): Promise<readonly EventRecord[]> { return structuredClone(this.events.filter(e => e.missionId === missionId)); }
}

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, Artifact>();
  async put(artifact: Artifact): Promise<void> { this.artifacts.set(artifact.id, structuredClone(artifact)); }
  async get(id: string): Promise<Artifact | null> { const artifact = this.artifacts.get(id); return artifact ? structuredClone(artifact) : null; }
  async listByMission(missionId: string): Promise<readonly Artifact[]> { return structuredClone([...this.artifacts.values()].filter(a => a.missionId === missionId)); }
}

export class JsonlEventStore implements EventStore {
  public constructor(private readonly filePath: string) {}
  async append(event: EventRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(event) + '\n', 'utf8');
  }
  async list(missionId: string): Promise<readonly EventRecord[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return raw.split('\n').filter(Boolean).map(line => JSON.parse(line) as EventRecord).filter(event => event.missionId === missionId);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT') return [];
      throw error;
    }
  }
}

export class FileArtifactStore implements ArtifactStore {
  public constructor(private readonly rootDir: string) {}
  async put(artifact: Artifact): Promise<void> {
    const path = join(this.rootDir, artifact.id + '.json');
    await mkdir(dirname(path), { recursive: true });
    const tmp = path + '.tmp';
    await writeFile(tmp, JSON.stringify(artifact, null, 2), 'utf8');
    await rename(tmp, path);
  }
  async get(id: string): Promise<Artifact | null> {
    try { return JSON.parse(await readFile(join(this.rootDir, id + '.json'), 'utf8')) as Artifact; }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT') return null;
      throw error;
    }
  }
  async listByMission(missionId: string): Promise<readonly Artifact[]> {
    const { readdir } = await import('node:fs/promises');
    try {
      const files = await readdir(this.rootDir);
      const result: Artifact[] = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const item = JSON.parse(await readFile(join(this.rootDir, file), 'utf8')) as Artifact;
        if (item.missionId === missionId) result.push(item);
      }
      return result;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT') return [];
      throw error;
    }
  }
}
