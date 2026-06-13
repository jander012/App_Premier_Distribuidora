import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { normalizePolygonForMap } from '../../utils/normalizePolygon.js';

function ringFromCoordPairs(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const coords = ring.map((p) => [Number(p[0]), Number(p[1])]);
  if (coords.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const closed =
    first[0] === last[0] && first[1] === last[1] ? coords : [...coords, [first[0], first[1]]];
  if (closed.length < 4) return null;
  return closed;
}

function polygonFromLayer(layer) {
  if (!layer) return null;
  if (typeof layer.toGeoJSON === 'function') {
    try {
      const feat = layer.toGeoJSON(6);
      const g = feat?.type === 'Feature' ? feat.geometry : feat;
      if (g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
        const closed = ringFromCoordPairs(g.coordinates[0]);
        if (closed) return { type: 'Polygon', coordinates: [closed] };
      }
      if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates?.[0]?.[0])) {
        const closed = ringFromCoordPairs(g.coordinates[0][0]);
        if (closed) return { type: 'Polygon', coordinates: [closed] };
      }
    } catch {
      /* fallback abaixo */
    }
  }
  if (!layer.getLatLngs) return null;
  const raw = layer.getLatLngs();
  const latlngs = Array.isArray(raw[0]) ? raw[0] : raw;
  if (!latlngs?.length || typeof latlngs[0]?.lat !== 'number') return null;
  const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]]);
  }
  if (coords.length < 4) return null;
  return { type: 'Polygon', coordinates: [coords] };
}

function logAdminPolygonLocation(gj) {
  if (!gj?.coordinates?.[0]?.length) {
    console.log('[admin entrega] polígono: nenhum');
    return;
  }
  const ring = gj.coordinates[0];
  let n = ring.length;
  const closed =
    n >= 2 &&
    ring[0][0] === ring[n - 1][0] &&
    ring[0][1] === ring[n - 1][1];
  if (closed) n -= 1;
  let slat = 0;
  let slng = 0;
  for (let i = 0; i < n; i += 1) {
    slng += Number(ring[i][0]);
    slat += Number(ring[i][1]);
  }
  if (n > 0) {
    console.log('[admin entrega] polígono (centro aprox.)', {
      lat: slat / n,
      lng: slng / n,
      vertices: n,
    });
  }
}

function isMapReady(map) {
  if (!map) return false;
  const container = map.getContainer?.();
  return Boolean(
    container &&
      container.isConnected &&
      map.getPane?.('markerPane') &&
      map.getPane?.('overlayPane')
  );
}

/**
 * @param {{
 *   centerLat?: number|null,
 *   centerLng?: number|null,
 *   polygon: object | null,
 *   onPolygonChange: (g: object | null) => void,
 *   storeOriginLat?: number|null,
 *   storeOriginLng?: number|null,
 *   onStoreOriginChange?: (v: { lat: number; lng: number }) => void,
 * }} props
 */
export function AdminDeliveryMap({
  centerLat,
  centerLng,
  polygon,
  onPolygonChange,
  storeOriginLat,
  storeOriginLng,
  onStoreOriginChange,
}) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const storeMarkerRef = useRef(null);
  const onChangeRef = useRef(onPolygonChange);
  onChangeRef.current = onPolygonChange;
  const onStoreOriginRef = useRef(onStoreOriginChange);
  onStoreOriginRef.current = onStoreOriginChange;

  const [mapEpoch, setMapEpoch] = useState(0);

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;

    const lat0 = Number(centerLat);
    const lng0 = Number(centerLng);
    const hasCenter = Number.isFinite(lat0) && Number.isFinite(lng0);
    const map = L.map(wrapRef.current, { zoomControl: true }).setView(hasCenter ? [lat0, lng0] : [-15.78, -47.93], hasCenter ? 14 : 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: { color: '#0d6efd', weight: 2 },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    map.addControl(drawControl);

    const emitPolygon = () => {
      let gj = null;
      drawnItems.eachLayer((ly) => {
        gj = polygonFromLayer(ly) || gj;
      });
      onChangeRef.current(gj);
    };

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      emitPolygon();
    });
    map.on(L.Draw.Event.EDITED, () => {
      emitPolygon();
    });
    map.on(L.Draw.Event.DELETED, () => {
      onChangeRef.current(null);
    });

    mapRef.current = map;
    setMapEpoch((n) => n + 1);

    return () => {
      storeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centro só na criação; sync no efeito seguinte
  }, []);

  useEffect(() => {
    let tries = 0;
    let disposed = false;
    const frameIds = [];
    const enqueueFrame = (fn) => {
      const id = requestAnimationFrame(() => {
        const index = frameIds.indexOf(id);
        if (index >= 0) frameIds.splice(index, 1);
        if (!disposed) fn();
      });
      frameIds.push(id);
    };
    const sync = () => {
      if (disposed) return;
      const map = mapRef.current;
      const drawnItems = drawnItemsRef.current;
      if (!map || !drawnItems || !isMapReady(map)) {
        if (tries++ < 50) enqueueFrame(sync);
        return;
      }

      const normalized = normalizePolygonForMap(polygon);

      const apply = () => {
        if (disposed || mapRef.current !== map || !isMapReady(map)) return;
        try {
          map.invalidateSize();
          drawnItems.clearLayers();
          if (normalized?.type === 'Polygon' && normalized.coordinates?.[0]?.length >= 4) {
            const layer = L.geoJSON(normalized, {
              style: { color: '#0d6efd', weight: 2, fillOpacity: 0.12 },
            });
            layer.eachLayer((ly) => drawnItems.addLayer(ly));
            try {
              map.fitBounds(layer.getBounds().pad(0.08));
            } catch {
              /* ignore */
            }
          } else if (Number.isFinite(Number(centerLat)) && Number.isFinite(Number(centerLng))) {
            map.setView([Number(centerLat), Number(centerLng)], 14);
          }
        } catch {
          /* ignore */
        }

        const setOrigin = onStoreOriginRef.current;
        if (typeof setOrigin === 'function') {
          if (!isMapReady(map)) return;
          const oLa = Number(storeOriginLat);
          const oLn = Number(storeOriginLng);
          let lat = Number.isFinite(oLa) ? oLa : null;
          let lng = Number.isFinite(oLn) ? oLn : null;
          if (lat == null || lng == null) {
            try {
              const c = map.getCenter();
              lat = c.lat;
              lng = c.lng;
            } catch {
              lat = -15.78;
              lng = -47.93;
            }
          }
          const icon = L.divIcon({
            className: 'delivery-store-origin-marker',
            html: '<div style="width:20px;height:20px;border-radius:50%;background:#ea580c;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          if (!storeMarkerRef.current) {
            const m = L.marker([lat, lng], { draggable: true, icon, zIndexOffset: 2000 });
            if (!isMapReady(map)) return;
            m.addTo(map);
            m.on('dragend', () => {
              const ll = m.getLatLng();
              onStoreOriginRef.current?.({ lat: ll.lat, lng: ll.lng });
            });
            storeMarkerRef.current = m;
          } else {
            storeMarkerRef.current.setLatLng([lat, lng]);
          }
        }
      };

      enqueueFrame(() => {
        apply();
        enqueueFrame(apply);
      });
    };
    sync();
    return () => {
      disposed = true;
      for (const id of frameIds) cancelAnimationFrame(id);
    };
  }, [polygon, centerLat, centerLng, mapEpoch, storeOriginLat, storeOriginLng]);

  return (
    <div
      ref={wrapRef}
      style={{ height: 420, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #ddd)' }}
    />
  );
}
