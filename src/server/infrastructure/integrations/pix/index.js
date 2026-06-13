import { env } from '../../config/env.js';
import { pixStubProvider } from './stubProvider.js';

export function getPixProvider() {
  if (env.pixProvider === 'stub' || !env.pixProvider) return pixStubProvider;
  return pixStubProvider;
}
