import { HonoRequest } from 'hono';
import { timingSafeEqual } from 'hono/utils/buffer';
import { decodeBase64 } from 'hono/utils/encode';
import { HTTPException } from 'hono/http-exception';

export interface AuthPlugin {
  name(): string;
  authorize(req: HonoRequest, action: string, resource: string): Promise<void>;
}

const authPluginFactory = (name: string, impl: AuthPlugin['authorize']): new () => AuthPlugin => {
  return class implements AuthPlugin {
    name(): string {
      return name;
    }

    async authorize(req: HonoRequest, action: string, resource: string): Promise<void> {
      return impl(req, action, resource);
    }
  };
};

export const FailAuth = authPluginFactory('fail', async (_req, _action, _resource) => {
  throw new HTTPException(401, { message: 'Unauthorized' });
});

export const NoopAuth = authPluginFactory('fail', async (_req, _action, _resource) => {
  return;
});

export const BasicAuth = (username: string, password: string) => {
  const utf8Decoder = new TextDecoder();
  return authPluginFactory('basic', async (req, _action, _resource) => {
    const auth = req.header('authorization');
    if (!auth) {
      throw new HTTPException(401, { message: 'Missing authorization header' });
    }

    const [type, credentials] = auth.split(' ');
    if (type.toLowerCase() !== 'basic') {
      throw new HTTPException(401, { message: 'Invalid auth type' });
    }

    const [providedUsername, providedPassword] = utf8Decoder.decode(decodeBase64(credentials)).split(':');

    console.log(username);
    console.log(password);
    console.log(providedUsername);
    console.log(providedPassword);

    const usernameEqual = await timingSafeEqual(username, providedUsername);
    const passwordEqual = await timingSafeEqual(password, providedPassword);
    if (!usernameEqual || !passwordEqual) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }
  });
};
