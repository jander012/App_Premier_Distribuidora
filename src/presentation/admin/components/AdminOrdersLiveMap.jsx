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

const DEFAULT_CENTER = [-15.601, -56.097]; // Cuiabá — fallback da loja

function pinIcon(label, tone) {
  return L.divIcon({
    className: `admin-orders-map__pin admin-orders-map__pin--${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [64, 28],
    iconAnchor: [32, 28],
  });
}

function deliveryPin(row) {
  const lat = Number(row.delivery_latitude ?? row.delivery?.latitude);
  const lng = Number(row.delivery_longitude ?? row.delivery?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function driverPin(row) {
  const lat = Number(row.driver_lat);
  const lng = Number(row.driver_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const at = row.driver_location_at ? new Date(row.driver_location_at).getTime() : 0;
  // GPS antigo (>45 min) não entra no mapa
  if (at && Date.now() - at > 45 * 60 * 1000) return null;
  return { lat, lng };
}

function toneForStatus(status) {
  if (status === 'received') return 'received';
  if (status === 'preparing') return 'preparing';
  return 'route';
}

/**
 * Mapa ao vivo: destinos dos pedidos do Kanban + entregadores em rota (filtráveis).
 * @param {{
 *   orders: object[],
 *   storeOriginLat?: number|null,
 *   storeOriginLng?: number|null,
 * }} props
 */
export function AdminOrdersLiveMap({ orders, storeOriginLat, storeOriginLng }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [driverFilter, setDriverFilter] = useState('all');

  const driversOnRoute = useMemo(() => {
    const map = new Map();
    for (const o of orders || []) {
      if (o.status !== 'out_for_delivery' && o.status !== 'delivered_pending_confirmation') continue;
      const id = o.assigned_driver_id ?? o.driver_id;
      if (id == null) continue;
      const name = o.driver_name || `Entregador #${id}`;
      if (!map.has(Number(id))) map.set(Number(id), { id: Number(id), name });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [orders]);

  useEffect(() => {
    if (driverFilter === 'all') return;
    if (!driversOnRoute.some((d) => String(d.id) === String(driverFilter))) {
      setDriverFilter('all');
    }
  }, [driversOnRoute, driverFilter]);

  const markers = useMemo(() => {
    const list = [];
    for (const o of orders || []) {
      const dest = deliveryPin(o);
      if (dest) {
        list.push({
          key: `order-${o.id}`,
          kind: 'order',
          lat: dest.lat,
          lng: dest.lng,
          tone: toneForStatus(o.status),
          label: `#${o.id}`,
          title: `${o.customer_full_name || 'Cliente'} · #${o.id}`,
          status: o.status,
          driverId: o.assigned_driver_id ?? o.driver_id,
        });
      }
      const onRoute = o.status === 'out_for_delivery' || o.status === 'delivered_pending_confirmation';
      if (!onRoute) continue;
      const dId = o.assigned_driver_id ?? o.driver_id;
      if (driverFilter !== 'all' && Number(dId) !== Number(driverFilter)) continue;
      const gps = driverPin(o);
      if (!gps) continue;
      list.push({
        key: `driver-${o.id}-${dId}`,
        kind: 'driver',
        lat: gps.lat,
        lng: gps.lng,
        tone: 'driver',
        label: (o.driver_name || 'Entregador').split(' ')[0],
        title: `${o.driver_name || 'Entregador'} · pedido #${o.id}`,
        status: o.status,
        driverId: dId,
      });
    }
    return list;
  }, [orders, driverFilter]);

  const orderPinsCount = markers.filter((m) => m.kind === 'order').length;
  const driverPinsCount = markers.filter((m) => m.kind === 'driver').length;

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;
    const oLa = Number(storeOriginLat);
    const oLn = Number(storeOriginLng);
    const hasOrigin = Number.isFinite(oLa) && Number.isFinite(oLn);
    const map = L.map(wrapRef.current, {
      zoomControl: true,
      center: hasOrigin ? [oLa, oLn] : DEFAULT_CENTER,
      zoom: 13,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = typeof ResizeObserver !== 'undefined'
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
      layerRef.current = null;
    };
  }, [storeOriginLat, storeOriginLng]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = [];

    const oLa = Number(storeOriginLat);
    const oLn = Number(storeOriginLng);
    if (Number.isFinite(oLa) && Number.isFinite(oLn)) {
      const store = L.marker([oLa, oLn], {
        icon: pinIcon('Loja', 'store'),
        interactive: false,
      }).addTo(layer);
      store.bindTooltip('Origem da loja', { direction: 'top', offset: [0, -24] });
      bounds.push([oLa, oLn]);
    }

    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: pinIcon(m.label, m.tone),
        zIndexOffset: m.kind === 'driver' ? 800 : 400,
      }).addTo(layer);
      marker.bindTooltip(m.title, { direction: 'top', offset: [0, -24] });
      bounds.push([m.lat, m.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [markers, storeOriginLat, storeOriginLng]);

  return (
    <aside className="admin-orders-map card">
      <div className="admin-orders-map__head">
        <div>
          <strong>Mapa ao vivo</strong>
          <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            {orderPinsCount} destino{orderPinsCount === 1 ? '' : 's'} · {driverPinsCount} em rota no mapa
          </p>
        </div>
        <div className="field admin-orders-map__filter">
          <label htmlFor="orders-map-driver-filter">Entregadores em rota</label>
          <select
            id="orders-map-driver-filter"
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
          >
            <option value="all">Todos em rota</option>
            {driversOnRoute.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-orders-map__legend">
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--received">Recebido</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--preparing">Preparo</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--route">Andamento</span>
        <span className="admin-orders-map__legend-item admin-orders-map__legend-item--driver">Entregador</span>
      </div>
      <div ref={wrapRef} className="admin-orders-map__canvas" />
      {orderPinsCount === 0 && driverPinsCount === 0 && (
        <p className="muted admin-orders-map__empty">
          Sem coordenadas nos pedidos atuais. Quando houver ponto de entrega ou GPS do app, aparecem aqui.
        </p>
      )}
    </aside>
  );
}
