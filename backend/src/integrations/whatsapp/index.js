import { env } from '../../config/env.js';
import { stubProvider } from './stubProvider.js';
import { metaProvider } from './metaProvider.js';

export function getWhatsAppProvider() {
  switch (env.whatsappProvider) {
    case 'meta':
      return metaProvider;
    default:
      return stubProvider;
  }
}
