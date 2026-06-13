import { useCallback, useEffect, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await api.get('/admin/settings', { headers: adminHeaders() });
      setSettings(s);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.put(
        '/admin/settings',
        {
          delivery_fee: Number(fd.get('delivery_fee')),
          menu_base_url: fd.get('menu_base_url'),
          whatsapp_welcome_template: fd.get('whatsapp_welcome_template'),
          whatsapp_order_confirm_template: fd.get('whatsapp_order_confirm_template'),
          whatsapp_status_template: fd.get('whatsapp_status_template'),
          linx_integration_enabled: fd.get('linx_integration_enabled') === 'on',
          pickingo_integration_enabled: fd.get('pickingo_integration_enabled') === 'on',
        },
        { headers: adminHeaders() }
      );
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!settings) {
    return <p className="muted">Carregando…</p>;
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Loja</h1>
        <Link to="/admin/painel/entrega" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
          Entrega (distância / dias)
        </Link>
      </div>
      {err && <p className="err">{err}</p>}
      <form className="card" onSubmit={saveSettings}>
        <div className="field">
          <label>Taxa de entrega (R$)</label>
          <input name="delivery_fee" type="number" step="0.01" defaultValue={settings.delivery_fee} />
        </div>
        <div className="field">
          <label>URL base do cardápio (link WhatsApp)</label>
          <input name="menu_base_url" defaultValue={settings.menu_base_url || ''} />
        </div>
        <div className="field">
          <label>Template saudação (opcional)</label>
          <textarea name="whatsapp_welcome_template" defaultValue={settings.whatsapp_welcome_template || ''} rows={3} />
        </div>
        <div className="field">
          <label>Template confirmação pedido (opcional)</label>
          <textarea name="whatsapp_order_confirm_template" defaultValue={settings.whatsapp_order_confirm_template || ''} rows={3} />
        </div>
        <div className="field">
          <label>Template status (opcional)</label>
          <textarea name="whatsapp_status_template" defaultValue={settings.whatsapp_status_template || ''} rows={2} />
        </div>
        <div className="section-label">Integrações</div>
        <label className="check-row">
          <input
            name="linx_integration_enabled"
            type="checkbox"
            defaultChecked={Boolean(settings.linx_integration_enabled)}
          />
          Enviar pedidos para Linx POS
        </label>
        <label className="check-row">
          <input
            name="pickingo_integration_enabled"
            type="checkbox"
            defaultChecked={Boolean(settings.pickingo_integration_enabled)}
          />
          Criar entrega na Pickingo
        </label>
        <button type="submit" className="btn btn-primary">
          Salvar
        </button>
      </form>
    </div>
  );
}
