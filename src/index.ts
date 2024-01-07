import { Hono } from 'hono';
import { statesRouter } from './states';
import { Bindings } from './bindings';

const app = new Hono<{ Bindings: Bindings }>();

app.route('/states', statesRouter);

app.onError((err, c) => {
  console.error(`${err}`);
  return c.text('Internal Server Error', 500);
});

export default app;
