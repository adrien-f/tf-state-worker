import { Hono } from 'hono';
import { stream } from 'hono/streaming';

const app = new Hono<{
  Bindings: {
    STATE_BUCKET: R2Bucket;
  };
}>();

app.get('/states/:stateId', async (c) => {
  const { stateId } = c.req.param();
  const state = await c.env.STATE_BUCKET.get(stateId);
  if (state === null) {
    return c.notFound();
  }

  return stream(c, async (stream) => await stream.pipe(state.body));
});

app.post('/states/:stateId', async (c) => {
  const { stateId } = c.req.param();
  await c.env.STATE_BUCKET.put(stateId, c.req.raw.body!);
  return new Response(null, { status: 200 });
});

app.delete('/states/:stateId', async (c) => {
  const { stateId } = c.req.param();
  await c.env.STATE_BUCKET.delete(stateId);
  return new Response(null, { status: 200 });
});

app.on('LOCK', '/states/:stateId', async (c) => {
  const { stateId } = c.req.param();
  const lock = await c.env.STATE_BUCKET.get(`${stateId}.lock`);
  if (lock !== null) {
    c.status(423);
    return c.text(await lock.text());
  }

  const lockBody = await c.req.arrayBuffer();
  await c.env.STATE_BUCKET.put(`${stateId}.lock`, lockBody);
  return c.body(lockBody);
});

app.on('UNLOCK', '/states/:stateId', async (c) => {
  const { stateId } = c.req.param();
  const lockInfo = await c.req.json();

  const existingLock = await c.env.STATE_BUCKET.get(`${stateId}.lock`);
  if (existingLock === null) {
    return new Response('attempting to unlock but resource not locked', { status: 409 });
  }

  const existingLockInfo = (await existingLock.json()) as any;

  if (lockInfo.ID !== existingLockInfo.ID) {
    c.status(409);
    return c.json(existingLockInfo);
  }

  await c.env.STATE_BUCKET.delete(`${stateId}.lock`);
  return c.json(existingLockInfo);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.text('', 500);
});

export default app;
