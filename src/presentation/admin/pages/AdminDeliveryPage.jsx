import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';
import { AdminDeliveryMap } from '../components/AdminDeliveryMap.jsx';
import { normalizePolygonForMap } from '../../utils/normalizePolygon.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatOriginCoordinates(lat, lng) {
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

export function AdminDeliveryPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [zones, setZones] = useState([]);
  const [dayModifiers, setDayModifiers] = useState([]);
  const [useZones, setUseZones] = useState(false);
  const [requireKm, setRequireKm] = useState(false);
  const [usePerKm, setUsePerKm] = useState(false);
  const [minTripFee, setMinTripFee] = useState('0');
  const [timeRates, setTimeRates] = useState([]);
  const [deliveryPolygon, setDeliveryPolygon] = useState(null);
  const [polygonZones, setPolygonZones] = useState([]);
  const [selectedPolygonZone, setSelectedPolygonZone] = useState(0);
  /** Origem da loja (saída do entregador) — pino laranja no mapa */
  const [mapOrigin, setMapOrigin] = useState({ lat: null, lng: null });
  const [originAddress, setOriginAddress] = useState('');
  const [geocodingOrigin, setGeocodingOrigin] = useState(false);
  const [locatingBrowser, setLocatingBrowser] = useState(false);
  /** JSON do último GET — se o estado do mapa difere, o PUT envia deliveryAreaPolygon. */
  const serverPolygonJsonRef = useRef(JSON.stringify(null));
  /** Impede um segundo GET (ex. Strict Mode) de apagar o desenho local antes de salvar. */
  const pendingLocalMapEditRef = useRef(false);

  /**
   * @param {{ forcePolygonFromServer?: boolean }} [opts]
   * forcePolygonFromServer: após salvar, alinha estado com a API.
   */
  const reverseGeocodeOrigin = useCallback(async (lat, lng) => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    try {
      const params = new URLSearchParams({
        lat: String(la),
        lon: String(ln),
        format: 'jsonv2',
        addressdetails: '1',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const label = String(data?.display_name || '').trim();
      setOriginAddress(label || formatOriginCoordinates(la, ln));
    } catch {
      setOriginAddress(formatOriginCoordinates(la, ln));
    }
  }, []);

  const handleStoreOriginChange = useCallback((o) => {
    setSaved(false);
    setMapOrigin({ lat: o.lat, lng: o.lng });
    reverseGeocodeOrigin(o.lat, o.lng);
  }, [reverseGeocodeOrigin]);

  async function geocodeStoreOrigin() {
    const q = originAddress.trim();
    if (!q) {
      setErr('Informe o endereço da loja para localizar no mapa.');
      return;
    }
    setErr(null);
    setSaved(false);
    setGeocodingOrigin(true);
    try {
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '1',
        countrycodes: 'br',
        addressdetails: '1',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Não foi possível buscar o endereço da loja.');
      const rows = await res.json();
      const hit = Array.isArray(rows) ? rows[0] : null;
      const lat = Number(hit?.lat);
      const lng = Number(hit?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Endereço da loja não encontrado. Tente incluir cidade, UF e CEP.');
      }
      setMapOrigin({ lat, lng });
      if (hit?.display_name) setOriginAddress(hit.display_name);
    } catch (e) {
      setErr(e.message);
    } finally {
      setGeocodingOrigin(false);
    }
  }

  function useBrowserLocationForOrigin() {
    if (!navigator.geolocation) {
      setErr('Seu navegador não oferece suporte à localização.');
      return;
    }
    setErr(null);
    setSaved(false);
    setLocatingBrowser(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setMapOrigin({ lat, lng });
          reverseGeocodeOrigin(lat, lng);
        } else {
          setErr('Não foi possível ler uma localização válida do navegador.');
        }
        setLocatingBrowser(false);
      },
      (error) => {
        const messages = {
          1: 'Permissão de localização negada pelo navegador.',
          2: 'Localização indisponível no momento.',
          3: 'Tempo esgotado ao buscar a localização.',
        };
        setErr(messages[error.code] || 'Não foi possível pegar a localização do navegador.');
        setLocatingBrowser(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }

  const load = useCallback(async (opts = {}) => {
    const forcePolygon = opts.forcePolygonFromServer === true;
    setErr(null);
    try {
      const d = await api.get('/admin/delivery', { headers: adminHeaders() });
      setData(d);
      setUseZones(Boolean(d.deliveryUseDistanceZones));
      setRequireKm(Boolean(d.deliveryRequireDistanceKm));
      setUsePerKm(Boolean(d.deliveryUsePerKmPricing));
      setMinTripFee(String(d.deliveryMinTripFee ?? 0));
      setTimeRates(
        (d.timeRates || []).map((r, idx) => ({
          timeStart: String(r.timeStart || '').slice(0, 5),
          timeEnd: String(r.timeEnd || '').slice(0, 5),
          pricePerKm: r.pricePerKm,
          sortOrder: r.sortOrder ?? idx,
        }))
      );
      setZones(
        (d.zones || []).map((z) => ({
          maxKm: z.maxKm,
          fee: z.fee,
          sortOrder: z.sortOrder,
        }))
      );
      setDayModifiers(d.dayModifiers || []);
      const nextPolygonZones = (d.polygonZones || []).map((z, idx) => ({
        name: z.name || `Área ${idx + 1}`,
        fee: z.fee ?? 0,
        geojson: normalizePolygonForMap(z.geojson),
        sortOrder: z.sortOrder ?? idx,
        active: z.active !== false,
      }));
      setPolygonZones(nextPolygonZones);
      setSelectedPolygonZone((idx) => Math.min(idx, Math.max(nextPolygonZones.length - 1, 0)));
      const loadedLat = d.deliveryOriginLat != null ? Number(d.deliveryOriginLat) : null;
      const loadedLng = d.deliveryOriginLng != null ? Number(d.deliveryOriginLng) : null;
      const loadedAddress = String(d.deliveryOriginAddress || '').trim();
      setMapOrigin({
        lat: loadedLat,
        lng: loadedLng,
      });
      setOriginAddress(
        loadedAddress ||
          (Number.isFinite(loadedLat) && Number.isFinite(loadedLng)
            ? formatOriginCoordinates(loadedLat, loadedLng)
            : '')
      );
      const norm = normalizePolygonForMap(d.deliveryAreaPolygon);
      serverPolygonJsonRef.current = JSON.stringify(norm);
      if (forcePolygon || !pendingLocalMapEditRef.current) {
        pendingLocalMapEditRef.current = false;
        setDeliveryPolygon(norm);
      }
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function addZone() {
    setZones((z) => [...z, { maxKm: 3, fee: 5, sortOrder: z.length }]);
  }

  function updateZone(i, field, value) {
    setZones((list) => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function removeZone(i) {
    setZones((list) => list.filter((_, j) => j !== i));
  }

  function addTimeRate() {
    setTimeRates((list) => [
      ...list,
      { timeStart: '08:00', timeEnd: '18:00', pricePerKm: 2, sortOrder: list.length },
    ]);
  }

  function updateTimeRate(i, field, value) {
    setTimeRates((list) => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function removeTimeRate(i) {
    setTimeRates((list) => list.filter((_, j) => j !== i));
  }

  function addPolygonZone() {
    setPolygonZones((list) => {
      const next = [
        ...list,
        { name: `Área ${list.length + 1}`, fee: 0, geojson: null, sortOrder: list.length, active: true },
      ];
      setSelectedPolygonZone(next.length - 1);
      return next;
    });
  }

  function updatePolygonZone(i, field, value) {
    setPolygonZones((list) => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function removePolygonZone(i) {
    setPolygonZones((list) => {
      const next = list.filter((_, j) => j !== i);
      setSelectedPolygonZone((idx) => Math.min(Math.max(0, idx > i ? idx - 1 : idx), Math.max(next.length - 1, 0)));
      return next;
    });
  }

  function updateDay(i, field, value) {
    setDayModifiers((list) => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    try {
      const fd = new FormData(e.target);
      const curJson = JSON.stringify(deliveryPolygon ?? null);
      const polygonChangedVsServer = curJson !== serverPolygonJsonRef.current;
      const body = {
        deliveryFee: Number(String(fd.get('delivery_fee')).replace(',', '.')),
        deliveryUseDistanceZones: useZones,
        deliveryRequireDistanceKm: requireKm,
        deliveryUsePerKmPricing: usePerKm,
        deliveryMinTripFee: Number(String(minTripFee).replace(',', '.')) || 0,
        timeRates: timeRates.map((r, idx) => ({
          timeStart: r.timeStart,
          timeEnd: r.timeEnd,
          pricePerKm: Number(String(r.pricePerKm).replace(',', '.')),
          sortOrder: r.sortOrder ?? idx,
        })),
        deliveryOriginLat:
          mapOrigin.lat != null && Number.isFinite(mapOrigin.lat) ? mapOrigin.lat : null,
        deliveryOriginLng:
          mapOrigin.lng != null && Number.isFinite(mapOrigin.lng) ? mapOrigin.lng : null,
        deliveryOriginAddress:
          originAddress.trim() ||
          (mapOrigin.lat != null && mapOrigin.lng != null
            ? formatOriginCoordinates(mapOrigin.lat, mapOrigin.lng)
            : null),
        zones: zones.map((z, idx) => ({
          maxKm: Number(String(z.maxKm).replace(',', '.')),
          fee: Number(String(z.fee).replace(',', '.')),
          sortOrder: z.sortOrder ?? idx,
        })),
        polygonZones: polygonZones
          .filter((z) => z.geojson?.type === 'Polygon')
          .map((z, idx) => ({
            name: z.name,
            fee: Number(String(z.fee).replace(',', '.')) || 0,
            geojson: z.geojson,
            sortOrder: z.sortOrder ?? idx,
            active: z.active !== false,
          })),
        dayModifiers: dayModifiers.map((m) => ({
          dayOfWeek: m.dayOfWeek,
          feeMultiplier: Number(String(m.feeMultiplier).replace(',', '.')),
          feeAdd: Number(String(m.feeAdd).replace(',', '.')),
        })),
        ...(polygonChangedVsServer ? { deliveryAreaPolygon: deliveryPolygon ?? null } : {}),
      };
      // eslint-disable-next-line no-console -- confirma envio ao backend
      console.log('[Entrega] PUT /admin/delivery inclui polígono?', polygonChangedVsServer, body.deliveryAreaPolygon);
      await api.put('/admin/delivery', body, { headers: adminHeaders() });
      setSaved(true);
      await load({ forcePolygonFromServer: true });
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!data && !err) {
    return <p className="muted">Carregando…</p>;
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Entrega</h1>
        <Link to="/admin/painel/loja" className="btn btn-ghost" style={{ width: 'auto' }}>
          Voltar à loja
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        Taxa base ou por faixa de quilometragem. Com <strong>origem da loja</strong> + faixas ativas, o sistema usa a{' '}
        <strong>rota de carro</strong> (OpenStreetMap/OSRM) até o pino do cliente — não distância em linha reta.
        Multiplicador e extra por dia da semana usam o horário do servidor ao finalizar o pedido. Com{' '}
        <strong>área no mapa</strong>, o cliente marca a entrega dentro do polígono.
      </p>
      {data?.storeId != null && (
        <p className="muted" style={{ marginTop: 4, fontSize: '0.82rem' }}>
          <strong>Loja (store_id) {data.storeId}</strong> — no MySQL use{' '}
          <code>SELECT * FROM store_delivery_polygons WHERE store_id = {data.storeId};</code>
        </p>
      )}
      {err && <p className="err">{err}</p>}
      {saved && <p className="muted" style={{ color: 'var(--accent)' }}>Salvo.</p>}

      <form className="card" onSubmit={save} style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Geral</h2>
        <div className="field">
          <label>Taxa padrão (R$) — usada se faixas desligadas ou sem km informado</label>
          <input
            key={`fee-${data?.deliveryFee ?? ''}`}
            name="delivery_fee"
            type="text"
            inputMode="decimal"
            defaultValue={data?.deliveryFee ?? 0}
            required
          />
        </div>
        <label className="row-between" style={{ cursor: 'pointer', marginBottom: '0.75rem' }}>
          <span>Usar faixas por distância (km)</span>
          <input type="checkbox" checked={useZones} onChange={(e) => setUseZones(e.target.checked)} />
        </label>
        <label className="row-between" style={{ cursor: 'pointer', marginBottom: '0.75rem' }}>
          <span>Obrigar distância/rota para calcular frete (faixas ou preço por km)</span>
          <input type="checkbox" checked={requireKm} onChange={(e) => setRequireKm(e.target.checked)} />
        </label>

        <h2 style={{ fontSize: '1.05rem' }}>Preço por km por horário</h2>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
          Quando ativo, a taxa de entrega = <strong>máximo entre o valor mínimo da corrida</strong> e{' '}
          <strong>distância (km) × R$/km</strong> do horário do pedido (servidor). Faixas fixas por km abaixo são
          ignoradas neste modo. Use origem no mapa + rota como na opção anterior.
        </p>
        <label className="row-between" style={{ cursor: 'pointer', marginBottom: '0.75rem' }}>
          <span>Usar R$/km por faixa de horário</span>
          <input type="checkbox" checked={usePerKm} onChange={(e) => setUsePerKm(e.target.checked)} />
        </label>
        {usePerKm && (
          <>
            <div className="field">
              <label>Valor mínimo da corrida (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={minTripFee}
                onChange={(e) => setMinTripFee(e.target.value)}
                required
              />
            </div>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              Faixas de horário (HH:MM). Se o horário do pedido não cair em nenhuma, usa a primeira linha da lista.
              Horário que cruza meia-noite: início maior que fim (ex.: 22:00–06:00).
            </p>
            {timeRates.map((r, i) => (
              <div key={i} className="row-between" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  type="time"
                  value={r.timeStart}
                  onChange={(e) => updateTimeRate(i, 'timeStart', e.target.value)}
                  style={{ width: 120 }}
                />
                <span className="muted">até</span>
                <input
                  type="time"
                  value={r.timeEnd}
                  onChange={(e) => updateTimeRate(i, 'timeEnd', e.target.value)}
                  style={{ width: 120 }}
                />
                <span className="muted">R$/km</span>
                <input
                  style={{ width: 90 }}
                  inputMode="decimal"
                  value={r.pricePerKm}
                  onChange={(e) => updateTimeRate(i, 'pricePerKm', e.target.value)}
                />
                <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => removeTimeRate(i)}>
                  Remover
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ marginBottom: '1rem' }} onClick={addTimeRate}>
              + Faixa de horário
            </button>
          </>
        )}

        <h2 style={{ fontSize: '1.05rem' }}>Mapa: origem da loja + área de entrega</h2>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Primeiro localize o <strong>endereço da loja</strong>. O mapa usa esse ponto como origem para desenhar a área
          de entrega e calcular taxa por <em>rota</em>. Depois ajuste o pino laranja se necessário e desenhe o
          polígono azul.
        </p>
        <div className="field">
          <label>Endereço da loja</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade - UF"
              style={{ flex: '1 1 280px' }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto' }}
              disabled={geocodingOrigin}
              onClick={geocodeStoreOrigin}
            >
              {geocodingOrigin ? 'Buscando...' : 'Buscar no mapa'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto' }}
              disabled={locatingBrowser}
              onClick={useBrowserLocationForOrigin}
            >
              {locatingBrowser ? 'Localizando...' : 'Usar minha localização'}
            </button>
          </div>
        </div>
        {mapOrigin.lat != null && mapOrigin.lng != null && (
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: 0 }}>
            Origem salva neste formulário: {mapOrigin.lat.toFixed(6)}, {mapOrigin.lng.toFixed(6)}
          </p>
        )}
        <AdminDeliveryMap
          centerLat={mapOrigin.lat ?? data?.deliveryOriginLat}
          centerLng={mapOrigin.lng ?? data?.deliveryOriginLng}
          storeOriginLat={mapOrigin.lat}
          storeOriginLng={mapOrigin.lng}
          onStoreOriginChange={handleStoreOriginChange}
          polygon={deliveryPolygon}
          onPolygonChange={(gj) => {
            pendingLocalMapEditRef.current = true;
            // eslint-disable-next-line no-console -- debug: área desenhada no mapa
            console.log('[Entrega] Polígono marcado no mapa:', gj);
            setDeliveryPolygon(gj);
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 8, marginBottom: '1rem' }}
          onClick={() => {
            pendingLocalMapEditRef.current = true;
            // eslint-disable-next-line no-console -- debug
            console.log('[Entrega] Polígono marcado no mapa:', null);
            setDeliveryPolygon(null);
          }}
        >
          Limpar polígono
        </button>

        <h2 style={{ fontSize: '1.05rem' }}>Faixas (até X km → taxa R$)</h2>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Ordene do menor para o maior <strong>até</strong>. Ex.: 3 km → R$ 5; 7 km → R$ 8. Acima da última faixa vale a
          taxa da última linha.
        </p>
        <h2 style={{ fontSize: '1.05rem' }}>Poligonos com taxa de frete</h2>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Cada area abaixo pode ter uma taxa propria. Se o cliente marcar a entrega dentro dela, essa taxa e aplicada
          antes das faixas por km.
        </p>
        {polygonZones.map((z, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              padding: '0.75rem',
              border: '1px solid var(--surface2)',
              borderRadius: 8,
            }}
          >
            <div className="row-between" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Nome</label>
                <input value={z.name} onChange={(e) => updatePolygonZone(i, 'name', e.target.value)} />
              </div>
              <div className="field" style={{ width: 120, marginBottom: 0 }}>
                <label>Taxa R$</label>
                <input
                  inputMode="decimal"
                  value={z.fee}
                  onChange={(e) => updatePolygonZone(i, 'fee', e.target.value)}
                />
              </div>
              <button
                type="button"
                className={selectedPolygonZone === i ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ width: 'auto' }}
                onClick={() => setSelectedPolygonZone(i)}
              >
                Editar mapa
              </button>
              <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => removePolygonZone(i)}>
                Remover
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
              {z.geojson?.coordinates?.[0]?.length ? 'Poligono desenhado.' : 'Selecione e desenhe esta area no mapa abaixo.'}
            </p>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.75rem' }} onClick={addPolygonZone}>
          + Poligono com taxa
        </button>
        {polygonZones.length > 0 && (
          <>
            <p className="muted" style={{ fontSize: '0.82rem' }}>
              Editando: <strong>{polygonZones[selectedPolygonZone]?.name || `Área ${selectedPolygonZone + 1}`}</strong>
            </p>
            <AdminDeliveryMap
              key={`zone-map-${selectedPolygonZone}`}
              centerLat={mapOrigin.lat ?? data?.deliveryOriginLat}
              centerLng={mapOrigin.lng ?? data?.deliveryOriginLng}
              polygon={polygonZones[selectedPolygonZone]?.geojson ?? null}
              onPolygonChange={(gj) => updatePolygonZone(selectedPolygonZone, 'geojson', gj)}
            />
          </>
        )}

        <h2 style={{ fontSize: '1.05rem' }}>Faixas por km</h2>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Ordene do menor para o maior. Acima da ultima faixa vale a taxa da ultima linha.
        </p>
        {zones.map((z, i) => (
          <div key={i} className="row-between" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ minWidth: 80 }}>
              Até (km)
            </span>
            <input
              style={{ width: 100 }}
              value={z.maxKm}
              onChange={(e) => updateZone(i, 'maxKm', e.target.value)}
              inputMode="decimal"
            />
            <span className="muted">Taxa R$</span>
            <input
              style={{ width: 100 }}
              value={z.fee}
              onChange={(e) => updateZone(i, 'fee', e.target.value)}
              inputMode="decimal"
            />
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => removeZone(i)}>
              Remover
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ marginBottom: '1rem' }} onClick={addZone}>
          + Faixa
        </button>

        <h2 style={{ fontSize: '1.05rem' }}>Por dia da semana</h2>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Taxa final = taxa da faixa (ou padrão) × multiplicador + adicional.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Multiplicador</th>
                <th>+ R$ extra</th>
              </tr>
            </thead>
            <tbody>
              {dayModifiers.map((m, i) => (
                <tr key={m.dayOfWeek}>
                  <td>{DAY_LABELS[m.dayOfWeek]}</td>
                  <td>
                    <input
                      style={{ width: 100 }}
                      value={m.feeMultiplier}
                      onChange={(e) => updateDay(i, 'feeMultiplier', e.target.value)}
                      inputMode="decimal"
                    />
                  </td>
                  <td>
                    <input
                      style={{ width: 100 }}
                      value={m.feeAdd}
                      onChange={(e) => updateDay(i, 'feeAdd', e.target.value)}
                      inputMode="decimal"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Salvar entrega
        </button>
      </form>
    </div>
  );
}
