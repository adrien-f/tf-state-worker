import type { UnstableDevWorker } from 'wrangler';
import { unstable_dev } from 'wrangler';
import { InfoItem, State, LockInfo } from './states';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testState: State = {
  version: 4,
  terraform_version: '1.2.3',
  serial: 1,
  lineage: 'test-lineage',
};

const testLock: Partial<LockInfo> = {
  ID: 'test',
};

describe('States API', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'foo-'));
    worker = await unstable_dev('src/states.ts', {
      experimental: { disableExperimentalWarning: true },
      persistTo: tmpDir,
      r2: [
        {
          binding: 'STATE_BUCKET',
          bucket_name: 'states',
        },
      ],
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  test('GET /states', async () => {
    const res = await worker.fetch('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { states: InfoItem[]; locks: InfoItem[] };
    expect(body.states).not.toBeUndefined();
    expect(body.states).toHaveLength(0);
    expect(body.locks).not.toBeUndefined();
    expect(body.locks).toHaveLength(0);
  });

  test('POST /states/:stateId', async () => {
    const res = await worker.fetch('/test', {
      method: 'POST',
      body: JSON.stringify(testState),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
  });

  test('GET /states/:stateId', async () => {
    const res = await worker.fetch('/test');
    expect(res.status).toBe(200);
    const state = (await res.json()) as State;
    expect(state).not.toBeUndefined();
    expect(state).toEqual(testState);
  });

  test('UNLOCK /states/:id but no lock found', async () => {
    const res = await worker.fetch('/test', {
      method: 'UNLOCK',
      body: JSON.stringify(testLock),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(409);
  });

  test('LOCK /states/:stateId', async () => {
    const res = await worker.fetch('/test', {
      method: 'LOCK',
      body: JSON.stringify(testLock),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as LockInfo;
    expect(body).not.toBeUndefined();
    expect(body).toEqual(testLock);
  });

  test('LOCK /states/:stateId with another ID', async () => {
    const res = await worker.fetch('/test', {
      method: 'LOCK',
      body: JSON.stringify({ ID: 'invalid' } as Partial<LockInfo>),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(423);

    const body = (await res.json()) as LockInfo;
    expect(body).not.toBeUndefined();
    expect(body).toEqual(testLock);
  });

  test('GET /states with content', async () => {
    const res = await worker.fetch('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { states: InfoItem[]; locks: InfoItem[] };
    expect(body.states).not.toBeUndefined();
    expect(body.states).toHaveLength(1);
    expect(body.locks).not.toBeUndefined();
    expect(body.locks).toHaveLength(1);
  });

  test('UNLOCK /states/:id', async () => {
    const res = await worker.fetch('/test', {
      method: 'UNLOCK',
      body: JSON.stringify(testLock),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
  });

  test('DELETE /states/:id', async () => {
    const res = await worker.fetch('/test', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  test('GET /states after clean', async () => {
    const res = await worker.fetch('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { states: InfoItem[]; locks: InfoItem[] };
    expect(body.states).not.toBeUndefined();
    expect(body.states).toHaveLength(0);
    expect(body.locks).not.toBeUndefined();
    expect(body.locks).toHaveLength(0);
  });
});
