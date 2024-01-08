import { Hono } from 'hono';
import { statesRouter } from './states';
import { Bindings, Variables } from './bindings';
import { HTTPException } from 'hono/http-exception';

const app = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

app.route('/states', statesRouter);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      console.error(err);
    }

    return err.getResponse();
  }

  console.error(err);
  return c.text('Internal Server Error', 500);
});

export default app;
