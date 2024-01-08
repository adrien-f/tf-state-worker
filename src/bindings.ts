import { AuthPlugin } from './auth';

export type Bindings = {
  STATE_BUCKET: R2Bucket;
  AUTH_PLUGIN: string;
  AUTH_BASIC_USERNAME: string | undefined;
  AUTH_BASIC_PASSWORD: string | undefined;
};

export type Variables = {
  auth: AuthPlugin;
};
