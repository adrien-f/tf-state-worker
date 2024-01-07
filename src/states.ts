import { Hono } from 'hono';
import { stream } from 'hono/streaming';

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

export const statesRouter = new Hono<{
  Bindings: {
    STATE_BUCKET: R2Bucket;
  };
}>();

statesRouter.get('/', async (c) => {
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

  const state = await c.env.STATE_BUCKET.get(`states/${stateId}`);
  if (state === null) {
    return c.notFound();
  }

  return stream(c, async (stream) => await stream.pipe(state.body));
});

statesRouter.post('/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  let body;
  if (c.req.header('content-length') == null) {
    body = await c.req.arrayBuffer();
  } else {
    body = c.req.raw.body;
  }

  if (c.req.raw.body === null) {
    return new Response('body is null', { status: 500 });
  }

  await c.env.STATE_BUCKET.put(`states/${stateId}`, body);
  return new Response(null, { status: 200 });
});

statesRouter.delete('/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  await c.env.STATE_BUCKET.delete(`states/${stateId}`);
  return new Response(null, { status: 200 });
});

statesRouter.on('LOCK', '/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  const lock = await c.env.STATE_BUCKET.get(`locks/${stateId}`);
  if (lock !== null) {
    c.status(423);
    return c.text(await lock.text());
  }

  const lockBody = await c.req.arrayBuffer();
  await c.env.STATE_BUCKET.put(`locks/${stateId}`, lockBody);
  return c.body(lockBody);
});

statesRouter.on('UNLOCK', '/:stateId{[a-zA-Z0-9][\\w\\-\\.]*}', async (c) => {
  let { stateId } = c.req.param();
  if (!stateId.endsWith('.tfstate')) {
    stateId = stateId + '.tfstate';
  }

  const body = await c.req.text();

  // In a force-unlock scenario, Terraform does not send the state-id
  // See https://github.com/hashicorp/terraform/issues/28421
  // It is up to the implementation to figure what to do...
  // In our case we unlock
  if (body === '') {
    await c.env.STATE_BUCKET.delete(`locks/${stateId}`);
    return new Response(null, { status: 200 });
  }

  const lockInfo = JSON.parse(body) as LockInfo;

  const existingLock = await c.env.STATE_BUCKET.get(`locks/${stateId}`);
  if (existingLock === null) {
    return new Response('attempting to unlock but resource not locked', { status: 409 });
  }

  const existingLockInfo = (await existingLock.json()) as LockInfo;

  if (lockInfo.ID !== existingLockInfo.ID) {
    c.status(409);
    return c.json(existingLockInfo);
  }

  await c.env.STATE_BUCKET.delete(`locks/${stateId}`);
  return c.json(existingLockInfo);
});

export default statesRouter;
