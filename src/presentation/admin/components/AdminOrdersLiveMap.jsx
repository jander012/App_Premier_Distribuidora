import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

function imageUrl(asset) {
  return typeof asset === 'string' ? asset : asset?.src;
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: imageUrl(markerIcon2x),
  iconUrl: imageUrl(markerIcon),
  shadowUrl: imageUrl(markerShadow),
});

/** Fallback se a loja ainda não tiver origem cadastrada. */
const DEFAULT_CENTER = [-15.601, -56.097];
const NEAR_STORE_KM = 180;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pinIcon(label, tone) {
  return L.divIcon({
    className: `admin-orders-map__pin admin-orders-map__pin--${tone}`,
    html: `<span>${esc(label)}</span>`,
    iconSize: [72, 28],
    iconAnchor: [36, 28],
  });
}

/** Normaliza lat/lng (corrige troca comum) e rejeita inválidos. */
function normalizeLatLng(rawLat, rawLng) {
  let lat = Number(rawLat);
  let lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Clássico: valores trocados (lng em campo de lat)
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const t = lat;
    lat = lng;
    lng = t;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function kmBetween(a, b) {
  return L.latLng(a.lat, a.lng).distanceTo([b.lat, b.lng]) / 1000;
}

function nearStore(point, store, maxKm = NEAR_STORE_KM) {
  if (!store) return true;
  return kmBetween(point, store) <= maxKm;
}

function deliveryPin(row) {
  return normalizeLatLng(row.delivery_latitude ?? row.delivery?.latitude, row.delivery_longitude ?? row.delivery?.longitude);
}

function driverPin(row) {
  const pin = normalizeLatLng(row.driver_lat, row.driver_lng);
  if (!pin) return null;
  const at = row.driver_location_at ? new Date(row.driver_location_at).getTime() : 0;
  if (at && Date.now() - at > 45 * 60 * 1000) return null;
  return pin;
}

function toneForStatus(status) {
  if (status === 'received') return 'received';
  if (status === 'preparing') return 'preparing';
  return 'route';
}

function isOnRoute(status) {
  return status === 'out_for_delivery' || status === 'delivered_pending_confirmation';
}

function isNext(status) {
  return status === 'received' || status === 'preparing';
}

/**
 * Mapa ao vivo: loja fixa + pontos conforme o filtro.
 */
export function AdminOrdersLiveMap({ orders, storeOriginLat, storeOriginLng }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const storeLayerRef = useRef(null);
  const dynamicLayerRef = useRef(null);
  const [filter, setFilter] = useState('all');

  const storePoint = useMemo(() => {
    const p = normalizeLatLng(storeOriginLat, storeOriginLng);
    return p || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], isFallback: true };
  }, [storeOriginLat, storeOriginLng]);

  const driversOnRoute = useMemo(() => {
    const map = new Map();
    for (const o of orders || []) {
      if (!isOnRoute(o.status)) continue;
      const id = o.assigned_driver_id ?? o.driver_id;
      if (id == null) continue;
      const name = o.driver_name || `Entregador #${id}`;
      if (!map.has(Number(id))) map.set(Number(id), { id: Number(id), name });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [orders]);

  useEffect(() => {
    if (filter === 'all' || filter === 'next' || filter === 'route') return;
    if (filter.startsWith('driver:')) {
      const id = filter.slice(7);
      if (!driversOnRoute.some((d) => String(d.id) === id)) setFilter('all');
    }
  }, [driversOnRoute, filter]);

  const markers = useMemo(() => {
    const list = [];
    const store = storePoint.isFallback ? null : storePoint;

    for (const o of orders || []) {
      const dId = o.assigned_driver_id ?? o.driver_id;
      const onRoute = isOnRoute(o.status);
      const next = isNext(o.status);

      let includeOrder = false;
      let includeDriverGps = false;

      if (filter === 'all') {
        includeOrder = true;
        includeDriverGps = onRoute;
      } else if (filter === 'next') {
        includeOrder = next;
      } else if (filter === 'route') {
        includeOrder = onRoute;
        includeDriverGps = onRoute;
      } else if (filter.startsWith('driver:')) {
        const fid = Number(filter.slice(7));
        if (Number(dId) === fid && onRoute) {
          includeOrder = true;
          includeDriverGps = true;
        }
      }

      if (includeOrder) {
        const dest = deliveryPin(o);
        if (dest && nearStore(dest, store)) {
          list.push({
            key: `order-${o.id}`,
            kind: 'order',
            lat: dest.lat,
            lng: dest.lng,
            tone: toneForStatus(o.status),
            label: `#${o.id}`,
            title: `${o.customer_full_name || 'Cliente'} · #${o.id}`,
          });
        }
      }

      if (includeDriverGps) {
        const gps = driverPin(o);
        if (gps && nearStore(gps, store)) {
          list.push({
            key: `driver-${o.id}-${dId}`,
            kind: 'driver',
            lat: gps.lat,
            lng: gps.lng,
            tone: 'driver',
            label: (o.driver_name || 'Entregador').split(/\s+/)[0],
            title: `${o.driver_name || 'Entregador'} · pedido #${o.id}`,
          });
        }
      }
    }
    return list;
  }, [orders, filter, storePoint]);

  const orderPinsCount = markers.filter((m) => m.kind === 'order').length;
  const driverPinsCount = markers.filter((m) => m.kind === 'driver').length;

  // Mapa + camada fixa da loja (uma vez)
  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;

    const map = L.map(wrapRef.current, {
      zoomControl: true,
      center: [storePoint.lat, storePoint.lng],
      zoom: 13,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    storeLayerRef.current = L.layerGroup().addTo(map);
    dynamicLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize();
          })
        : null;
    if (ro) ro.observe(wrapRef.current);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      storeLayerRef.current = null;
      dynamicLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapa criado uma vez; origem atualiza no efeito abaixo
  }, []);

  // Ponto fixo da loja (sempre 1 marcador)
  useEffect(() => {
    const map = mapRef.current;
    const storeLayer = storeLayerRef.current;
    if (!map || !storeLayer) return;

    storeLayer.clearLayers();
    const storeMarker = L.marker([storePoint.lat, storePoint.lng], {
      icon: pinIcon('Loja', 'store'),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(storeLayer);
    storeMarker.bindTooltip(storePoint.isFallback ? 'Loja (posição padrão)' : 'Loja', {
      direction: 'top',
      offset: [0, -24],
      permanent: false,
    });

    // Centraliza na loja quando a origem chega/muda
    map.setView([storePoint.lat, storePoint.lng], Math.max(map.getZoom(), 13));
  }, [storePoint]);

  // Demais pontos conforme filtro
  useEffect(() => {
    const map = mapRef.current;
    const layer = dynamicLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = [[storePoint.lat, storePoint.lng]];

    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: pinIcon(m.label, m.tone),
        zIndexOffset: m.kind === 'driver' ? 800 : 400,
      }).addTo(layer);
      marker.bindTooltip(m.title, { direction: 'top', offset: [0, -24] });
      bounds.push([m.lat, m.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [markers, storePoint]);

  return (
    <aside className="admin-orders-map card">
      <div className="admin-orders-map__head">
        <div>
          <strong>Mapa ao vivo</strong>
          <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Loja fixa · {orderPinsCount} pedido{orderPinsCount === 1 ? '' : 's'} · {driverPinsCount} em rota
          </p>
        </div>
        <div className="field admin-orders-map__filter">
          <label htmlFor="orders-map-filter">Filtro do mapa</label>
          <select id="orders-map-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos os pedidos</option>
            <option value="next">Só próximos (recebido / preparo)</option>
            <option value="route">Só em andamento</option>
            {driversOnRoute.map((d) => (
              <option key={d.id} value={`driver:${d.id}`}>
                Em rota: {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-orders-map__legend">
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--store">Loja</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--received">Recebido</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--preparing">Preparo</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--route">Andamento</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--driver">Entregador</span>
      </div>
      <div ref={wrapRef} className="admin-orders-map__canvas" />
      {orderPinsCount === 0 && driverPinsCount === 0 && (
        <p className="muted admin-orders-map__empty">
          {storePoint.isFallback
            ? 'Cadastre a origem da loja em Entrega para fixar o mapa. Pedidos com GPS válido aparecem pelo filtro.'
            : 'Nenhum ponto no filtro atual. A loja permanece fixa no mapa.'}
        </p>
      )}
    </aside>
  );
}
