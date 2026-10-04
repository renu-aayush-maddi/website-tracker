import type { SessionDoc, UserDoc } from '../models/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      user: UserDoc;
      session: SessionDoc;
      token: string;
    };
  }
}
