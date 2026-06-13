/**
 * Esqueleto para Meta WhatsApp Business Cloud API.
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Implementar: POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 * Headers: Authorization: Bearer {WHATSAPP_API_TOKEN}
 */
export const metaProvider = {
  async sendText({ to, body }) {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      throw new Error('WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID são obrigatórios para metaProvider');
    }
    const digits = String(to).replace(/\D/g, '');
    const payload = {
      messaging_product: 'whatsapp',
      to: digits,
      type: 'text',
      text: { preview_url: false, body },
    };
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || `WhatsApp API erro ${res.status}`);
    }
    return { ok: true, providerRef: data.messages?.[0]?.id, raw: data };
  },
};
