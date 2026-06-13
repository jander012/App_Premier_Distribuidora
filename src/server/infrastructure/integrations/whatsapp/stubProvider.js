/**
 * Provedor stub: registra no console e retorna sucesso.
 * Substituir por Meta Cloud API ou Evolution API mantendo a mesma interface.
 */
export const stubProvider = {
  async sendText({ to, body, metadata }) {
    // eslint-disable-next-line no-console
    console.log('[WhatsApp stub] to=%s\n%s', to, body);
    return { ok: true, providerRef: `stub-${Date.now()}`, raw: metadata || {} };
  },
};
