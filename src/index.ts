import { Hono } from 'hono';
import { statesRouter } from './states';

const app = new Hono<{
  Bindings: {
    STATE_BUCKET: R2Bucket;
  };
}>();

app.route('/states', statesRouter);

app.onError((err, c) => {
  console.error(`${err}`);
  return c.text('', 500);
});

export default app;
