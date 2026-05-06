import { env } from '../../config/env.js';
import { pickingoStubProvider } from './stubProvider.js';

export function getPickingoProvider() {
  if (env.pickingoProvider === 'stub' || !env.pickingoProvider) return pickingoStubProvider;
  return pickingoStubProvider;
}
