import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pointInPolygonRing, ringBBoxCenterLatLng } from '../utils/pointInPolygon.js';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 };

function geoErrorMessage(code) {
  if (code === 1) return 'Permissão negada. Permita a localização no navegador ou arraste o marcador.';
  if (code === 2) return 'Posição indisponível. Tente de novo ou marque manualmente no mapa.';
  if (code === 3) return 'Tempo esgotado. Tente de novo.';
  return 'Não foi possível usar a localização.';
}

/**
 * @param {{
 *   polygon: object,
 *   initialLat?: number|null,
 *   initialLng?: number|null,
 *   onChange: (v: {lat:number,lng:number}) => void,
 * }} props
 */
export function CheckoutDeliveryMap({ polygon, initialLat, initialLng, onChange }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [geoHint, setGeoHint] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const runGeoRef = useRef(() => {});

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;

    const ring = polygon?.coordinates?.[0];
    const fallback = ring?.length ? ringBBoxCenterLatLng(ring) : [-15.78, -47.93];
    const savedLat = Number.isFinite(Number(initialLat)) ? Number(initialLat) : null;
    const savedLng = Number.isFinite(Number(initialLng)) ? Number(initialLng) : null;
    const hasSeedCoords = savedLat != null && savedLng != null;

    // Leaflet exige centro + zoom antes de flyTo/fitBounds; geolocalização pode voltar antes do layout.
    const map = L.map(wrapRef.current, {
      zoomControl: true,
      center: [fallback[0], fallback[1]],
      zoom: 14,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const polyLayer = L.geoJSON(polygon, {
      style: { color: '#c2410c', weight: 2, fillOpacity: 0.08 },
    }).addTo(map);

    const marker = L.marker([fallback[0], fallback[1]], { draggable: true }).addTo(map);
    markerRef.current = marker;

    const emit = () => {
      const ll = marker.getLatLng();
      const loc = { lat: ll.lat, lng: ll.lng };
      onChangeRef.current(loc);
    };
    marker.on('dragend', emit);

    const applyGeoPosition = (lat, lng) => {
      const m = mapRef.current;
      const mk = markerRef.current;
      if (!m || !mk) return;
      mk.setLatLng([lat, lng]);
      m.invalidateSize();
      m.flyTo([lat, lng], 17, { duration: 0.75 });
      onChangeRef.current({ lat, lng });
      setGeoHint(null);
    };

    const requestDevicePosition = (opts = {}) => {
      const { silent = false } = opts;
      if (!navigator.geolocation) {
        if (!silent) setGeoHint('Seu navegador não oferece geolocalização.');
        return;
      }
      if (!silent) {
        setGeoHint(null);
        setGeoLoading(true);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!silent) setGeoLoading(false);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          applyGeoPosition(lat, lng);
        },
        (err) => {
          if (!silent) {
            setGeoLoading(false);
            setGeoHint(geoErrorMessage(err?.code));
          }
        },
        GEO_OPTIONS
      );
    };

    const tryAutoGeoIfAlreadyPermitted = () => {
      if (hasSeedCoords || !navigator.geolocation) return;
      const ok = (pos) => {
        applyGeoPosition(pos.coords.latitude, pos.coords.longitude);
      };
      const noop = () => {};
      const tryQuery = async () => {
        try {
          const r = await navigator.permissions.query({ name: 'geolocation' });
          if (r.state === 'granted') {
            requestDevicePosition({ silent: true });
          }
        } catch {
          navigator.geolocation.getCurrentPosition(ok, noop, {
            enableHighAccuracy: false,
            timeout: 4000,
            maximumAge: 300_000,
          });
        }
      };
      void tryQuery();
    };

    const layoutMap = () => {
      map.invalidateSize();
      try {
        const b = polyLayer.getBounds();
        map.fitBounds(b.pad(0.1));
        if (savedLat != null && savedLng != null) {
          marker.setLatLng([savedLat, savedLng]);
        } else {
          marker.setLatLng(b.getCenter());
        }
      } catch {
        map.setView([fallback[0], fallback[1]], 14);
        if (savedLat != null && savedLng != null) {
          marker.setLatLng([savedLat, savedLng]);
        }
      }
      emit();
    };

    map.whenReady(() => {
      requestAnimationFrame(() => {
        layoutMap();
        requestAnimationFrame(() => {
          layoutMap();
          tryAutoGeoIfAlreadyPermitted();
        });
      });
    });

    mapRef.current = map;

    const runGeo = () => requestDevicePosition({ silent: false });

    runGeoRef.current = runGeo;

    return () => {
      runGeoRef.current = () => {};
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [polygon, initialLat, initialLng]);

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', maxWidth: 360 }}
          disabled={geoLoading}
          onClick={() => runGeoRef.current()}
        >
          {geoLoading ? 'Obtendo localização…' : 'Usar localização atual do aparelho'}
        </button>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 6, marginBottom: 0 }}>
          Se você já permitiu antes neste site, tentamos posicionar o mapa sozinhos. Na primeira vez, o navegador
          costuma pedir permissão após um clique no botão.
        </p>
      </div>
      {geoHint && (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0, marginBottom: 8 }}>
          {geoHint}
        </p>
      )}
      <div
        ref={wrapRef}
        style={{
          height: 280,
          width: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border, #ddd)',
        }}
      />
    </div>
  );
}

export function isInsideDeliveryPolygon(polygon, lat, lng) {
  const r = polygon?.coordinates?.[0];
  if (!r?.length) return true;
  return pointInPolygonRing(lng, lat, r);
}
