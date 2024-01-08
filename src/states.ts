import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { Bindings, Variables } from './bindings';
import { BasicAuth, FailAuth, NoopAuth } from './auth';

export type State = {
  version: string | number;
  terraform_version: string;
  serial: number;
  lineage: string;
};

export type LockInfo = {
  ID: string;
  Operation: string;
  Info: string;
  Who: string;
  Version: string;
  Created: string;
  Path: string;
};

export type InfoItem = {
  id: string;
  size: number;
  uploaded: string;
};

export const statesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

statesRouter.use('*', async (c, next) => {
  switch (c.env.AUTH_PLUGIN) {
    case 'basic':
      const { AUTH_BASIC_USERNAME, AUTH_BASIC_PASSWORD } = c.env;
      if (!AUTH_BASIC_USERNAME || !AUTH_BASIC_PASSWORD) {
        throw new Error('Missing AUTH_BASIC_USERNAME or AUTH_BASIC_PASSWORD');
      }
      c.set('auth', new (BasicAuth(AUTH_BASIC_USERNAME, AUTH_BASIC_PASSWORD))());
      break;
    case 'noop':
      c.set('auth', new NoopAuth());
      break;
    case 'fail':
    default:
      c.set('auth', new FailAuth());
      break;
  }

  await next();
});

statesRouter.get('/', async (c) => {
  await c.get('auth').authorize(c.req, 'list', '*');

  // TODO: handle pagination
  // https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2listoptions
  const states = (await c.env.STATE_BUCKET.list({ prefix: 'states' })).objects.map(
    (state): InfoItem => ({ id: state.key, size: state.size, uploaded: state.uploaded.toISOString() })
  );
  const locks = (await c.env.STATE_BUCKET.list({ prefix: 'locks' })).objects.map(
    (lock): InfoItem => ({
      id: lock.key,
      size: lock.size,
      uploaded: lock.uploaded.toISOString(),
    })
  );
  return c.json({ states, locks });
});

statesRouter.get('/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.get('auth').authorize(c.req, 'read', stateId);

  let state: R2ObjectBody | null;
  try {
    state = await c.env.STATE_BUCKET.get(`states/${stateId}`);
  } catch (err) {
    throw new Error(`Could not find state 'states/${stateId}' in bucket`, { cause: err });
  }

  if (state === null) {
    return c.notFound();
  }

  return stream(c, async (stream) => await stream.pipe(state!.body));
});

statesRouter.post('/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.get('auth').authorize(c.req, 'write', stateId);

  let body;
  if (c.req.header('content-length') == null) {
    body = await c.req.arrayBuffer();
  } else {
    body = c.req.raw.body;
  }

  if (body === null) {
    throw new Error('Could not read request body');
  }

  await c.env.STATE_BUCKET.put(`states/${stateId}`, body);
  return new Response(null, { status: 200 });
});

statesRouter.delete('/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.get('auth').authorize(c.req, 'delete', stateId);

  try {
    await c.env.STATE_BUCKET.delete(`states/${stateId}`);
  } catch (err) {
    throw new Error(`Could not delete state 'states/${stateId}' in bucket`, { cause: err });
  }
  return new Response(null, { status: 200 });
});

statesRouter.on('LOCK', '/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.get('auth').authorize(c.req, 'write', stateId);

  let lock: R2ObjectBody | null;
  try {
    lock = await c.env.STATE_BUCKET.get(`locks/${stateId}`);
  } catch (err) {
    throw new Error(`Could not find lock 'locks/${stateId}' in bucket`, { cause: err });
  }

  if (lock !== null) {
    c.status(423);
    return c.text(await lock.text());
  }

  const lockBody = await c.req.arrayBuffer();

  try {
    await c.env.STATE_BUCKET.put(`locks/${stateId}`, lockBody);
  } catch (err) {
    throw new Error(`Could not write lock 'locks/${stateId}' in bucket`, { cause: err });
  }

  return c.body(lockBody);
});

statesRouter.on('UNLOCK', '/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.get('auth').authorize(c.req, 'write', stateId);

  const body = await c.req.text();

  // In a force-unlock scenario, Terraform does not send the state-id
  // See https://github.com/hashicorp/terraform/issues/28421
  // It is up to the implementation to figure what to do...
  // In our case we unlock anyway
  if (body === '') {
    try {
      await c.env.STATE_BUCKET.delete(`locks/${stateId}`);
    } catch (err) {
      throw new Error(`Could not delete lock 'locks/${stateId}' in bucket`, { cause: err });
    }
    return new Response('', { status: 200 });
  }

  const lockInfo = JSON.parse(body) as LockInfo;

  let existingLock: R2ObjectBody | null;
  try {
    existingLock = await c.env.STATE_BUCKET.get(`locks/${stateId}`);
  } catch (err) {
    throw new Error(`Could not find lock 'locks/${stateId}' in bucket`, { cause: err });
  }

  if (existingLock === null) {
    return new Response('attempting to unlock but resource not locked', { status: 409 });
  }

  const existingLockInfo = (await existingLock.json()) as LockInfo;

  if (lockInfo.ID !== existingLockInfo.ID) {
    c.status(409);
    return c.json(existingLockInfo);
  }

  try {
    await c.env.STATE_BUCKET.delete(`locks/${stateId}`);
  } catch (err) {
    throw new Error(`Could not delete lock 'locks/${stateId}' in bucket`, { cause: err });
  }

  return c.json(existingLockInfo);
});

export default statesRouter;
