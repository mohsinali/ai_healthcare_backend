import { randomBytes } from 'node:crypto';

export const generateWidgetKey = (): string =>
  `wgt_${randomBytes(32).toString('base64url')}`;
