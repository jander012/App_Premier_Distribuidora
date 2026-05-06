import { env } from '../../config/env.js';
import { linxStubProvider } from './stubProvider.js';

export function getLinxProvider() {
  if (env.linxProvider === 'stub' || !env.linxProvider) return linxStubProvider;
  return linxStubProvider;
}
