import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

const HERO_MONTHS = [
  ['01', 'Janeiro'],
  ['02', 'Fevereiro'],
  ['03', 'Março'],
  ['04', 'Abril'],
  ['05', 'Maio'],
  ['06', 'Junho'],
  ['07', 'Julho'],
  ['08', 'Agosto'],
  ['09', 'Setembro'],
  ['10', 'Outubro'],
  ['11', 'Novembro'],
  ['12', 'Dezembro'],
];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return 'Sem alteração registrada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function statusLabel(status) {
  return status === 'closed' ? 'Fechada' : 'Aberta';
}

function getHeroMonthlyImages(settings) {
  const raw = settings?.hero_monthly_images;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

async function uploadAdminImage(file, title) {
  if (!file || file.size <= 0) return null;
  const fd = new FormData();
  fd.append('file', file);
  if (title) fd.append('title', title);
  const res = await fetch('/api/admin/media', {
    method: 'POST',
    headers: adminHeaders(),
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || res.statusText || 'Falha ao enviar imagem');
  }
  return data?.publicUrl || null;
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [storeStatus, setStoreStatus] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth);
  const [reason, setReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [s, status] = await Promise.all([
        api.get('/admin/settings', { headers: adminHeaders() }),
        api.get(`/admin/store-status?month=${encodeURIComponent(month)}`, { headers: adminHeaders() }),
      ]);
      setSettings(s);
      setStoreStatus(status);
    } catch (e) {
      setErr(e.message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const currentMonthlyImages = getHeroMonthlyImages(settings);
      const heroMonthlyImages = { ...currentMonthlyImages };
      const defaultHeroUpload = fd.get('hero_image_file');
      const uploadedDefaultHero = await uploadAdminImage(defaultHeroUpload, 'Banner padrão do cardápio');
      for (const [key] of HERO_MONTHS) {
        const file = fd.get(`hero_month_file_${key}`);
        const uploaded = await uploadAdminImage(file, `Banner do cardápio - mês ${key}`);
        if (uploaded) heroMonthlyImages[key] = uploaded;
      }
      await api.put(
        '/admin/settings',
        {
          delivery_fee: Number(fd.get('delivery_fee')),
          menu_base_url: fd.get('menu_base_url'),
          hero_image_url: uploadedDefaultHero || settings.hero_image_url || null,
          hero_monthly_images: heroMonthlyImages,
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

  async function changeStoreStatus(nextStatus) {
    setSavingStatus(true);
    setErr(null);
    try {
      const data = await api.patch(
        '/admin/store-status',
        {
          status: nextStatus,
          reason,
          month,
        },
        { headers: adminHeaders() }
      );
      setStoreStatus(data);
      setReason('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSavingStatus(false);
    }
  }

  const chartDays = storeStatus?.summary?.days || [];
  const maxOpenMinutes = useMemo(
    () => Math.max(1, ...chartDays.map((day) => Number(day.openMinutes) || 0)),
    [chartDays]
  );
  const maxCloseCount = useMemo(
    () => Math.max(1, ...chartDays.map((day) => Number(day.closeCount) || 0)),
    [chartDays]
  );

  if (!settings) {
    return <p className="muted">Carregando…</p>;
  }

  const current = storeStatus?.current;
  const summary = storeStatus?.summary;
  const isOpen = current?.isOpen !== false;
  const heroMonthlyImages = getHeroMonthlyImages(settings);

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Loja</h1>
        <Link to="/admin/painel/entrega" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
          Entrega (distância / dias)
        </Link>
      </div>
      {err && <p className="err">{err}</p>}
      <section className="card store-status-panel">
        <div className="store-status-panel__head">
          <div>
            <span className="section-label">Operação</span>
            <h2 className="store-status-panel__title">Loja {statusLabel(current?.status)}</h2>
            <p className="muted">
              Última alteração: {formatDateTime(current?.latestEvent?.createdAt)}
              {current?.latestEvent?.reason ? ` - ${current.latestEvent.reason}` : ''}
            </p>
          </div>
          <span className={`store-status-badge ${isOpen ? 'store-status-badge--open' : 'store-status-badge--closed'}`}>
            {isOpen ? 'Aberta' : 'Fechada'}
          </span>
        </div>
        <div className="field">
          <label>Motivo da alteração (opcional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: falta de energia, manutenção, pausa operacional"
          />
        </div>
        <div className="store-status-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingStatus || isOpen}
            onClick={() => changeStoreStatus('open')}
          >
            Abrir loja
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={savingStatus || !isOpen}
            onClick={() => changeStoreStatus('closed')}
          >
            Fechar loja
          </button>
        </div>
      </section>

      <section className="card store-status-panel">
        <div className="store-status-panel__head">
          <div>
            <span className="section-label">Resumo mensal</span>
            <h2 className="store-status-panel__title">
              {formatDuration(summary?.totalOpenMinutes)} aberta
            </h2>
            <p className="muted">
              {summary?.totalCloseCount || 0} fechamento(s) registrado(s) no mês.
            </p>
          </div>
          <div className="field store-status-month">
            <label htmlFor="store-status-month">Mês</label>
            <input
              id="store-status-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || getCurrentMonth())}
            />
          </div>
        </div>
        {chartDays.length === 0 ? (
          <p className="muted">Nenhum dado para este mês.</p>
        ) : (
          <div className="store-status-chart" aria-label="Tempo aberto e fechamentos por dia">
            {chartDays.map((day) => {
              const date = new Date(`${day.date}T00:00:00`);
              const openPct = Math.max(2, (Number(day.openMinutes) / maxOpenMinutes) * 100);
              const closePct = Math.max(0, (Number(day.closeCount) / maxCloseCount) * 100);
              return (
                <div key={day.date} className="store-status-chart__row">
                  <span className="store-status-chart__day">
                    {String(date.getDate()).padStart(2, '0')}
                  </span>
                  <div className="store-status-chart__bars">
                    <span
                      className="store-status-chart__bar store-status-chart__bar--open"
                      style={{ width: `${openPct}%` }}
                      title={`${formatDuration(day.openMinutes)} aberta`}
                    />
                    {day.closeCount > 0 && (
                      <span
                        className="store-status-chart__bar store-status-chart__bar--closed"
                        style={{ width: `${closePct}%` }}
                        title={`${day.closeCount} fechamento(s)`}
                      />
                    )}
                  </div>
                  <span className="store-status-chart__meta">
                    {formatDuration(day.openMinutes)} | {day.closeCount}x
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {summary?.events?.length > 0 && (
          <div className="store-status-events">
            <span className="section-label">Últimos eventos do mês</span>
            {summary.events.map((event) => (
              <div key={event.id} className="store-status-event">
                <strong>{statusLabel(event.status)}</strong>
                <span>{formatDateTime(event.createdAt)}</span>
                {event.reason && <span className="muted">{event.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <form className="card" onSubmit={saveSettings}>
        <div className="section-label">Configurações</div>
        <div className="field">
          <label>Taxa de entrega (R$)</label>
          <input name="delivery_fee" type="number" step="0.01" defaultValue={settings.delivery_fee} />
        </div>
        <div className="field">
          <label>URL base do cardápio (link WhatsApp)</label>
          <input name="menu_base_url" defaultValue={settings.menu_base_url || ''} />
        </div>
        <div className="section-label">Banner do cardápio</div>
        <div className="field">
          <label>Imagem padrão do banner</label>
          <input
            name="hero_image_file"
            type="file"
            accept="image/*"
          />
          {settings.hero_image_url && (
            <span className="muted" style={{ wordBreak: 'break-all' }}>
              Atual: {settings.hero_image_url}
            </span>
          )}
        </div>
        <div className="admin-hero-month-grid">
          {HERO_MONTHS.map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                name={`hero_month_file_${key}`}
                type="file"
                accept="image/*"
              />
              {heroMonthlyImages[key] && (
                <span className="muted" style={{ wordBreak: 'break-all' }}>
                  Atual: {heroMonthlyImages[key]}
                </span>
              )}
            </div>
          ))}
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
