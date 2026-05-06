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

function firstText(...values) {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
}

function normalizeReverseAddress(data) {
  const a = data?.address || {};
  const street = firstText(a.road, a.pedestrian, a.residential, a.footway, a.path, a.cycleway);
  const number = firstText(a.house_number);
  const neighborhood = firstText(a.neighbourhood, a.suburb, a.quarter, a.city_district, a.village);
  const zipCode = firstText(a.postcode);
  const city = firstText(a.city, a.town, a.municipality, a.village);
  const state = firstText(a.state);
  const reference = firstText(data?.name);
  return { street, number, neighborhood, zipCode, city, state, reference };
}

async function reverseGeocode(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('accept-language', 'pt-BR,pt');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('reverse_geocode_failed');
  return normalizeReverseAddress(await res.json());
}

/**
 * @param {{
 *   polygon?: object|null,
 *   initialLat?: number|null,
 *   initialLng?: number|null,
 *   onChange: (v: {lat:number,lng:number}) => void,
 *   onAddressChange?: (v: object) => void,
 * }} props
 */
export function CheckoutDeliveryMap({ polygon, initialLat, initialLng, onChange, onAddressChange }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onAddressChangeRef = useRef(onAddressChange);
  onChangeRef.current = onChange;
  onAddressChangeRef.current = onAddressChange;

  const [geoHint, setGeoHint] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const runGeoRef = useRef(() => {});

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;
    let destroyed = false;

    const hasPolygon = polygon?.type === 'Polygon' && polygon.coordinates?.[0]?.length >= 3;
    const ring = hasPolygon ? polygon.coordinates[0] : null;
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

    const polyLayer = hasPolygon
      ? L.geoJSON(polygon, {
          style: { color: '#171717', weight: 2, fillColor: '#fbbc23', fillOpacity: 0.12 },
        }).addTo(map)
      : null;

    const marker = L.marker([fallback[0], fallback[1]], { draggable: true }).addTo(map);
    markerRef.current = marker;

    const emit = () => {
      const ll = marker.getLatLng();
      const loc = { lat: ll.lat, lng: ll.lng };
      onChangeRef.current(loc);
    };
    marker.on('dragend', emit);

    const applyGeoPosition = async (lat, lng, opts = {}) => {
      const { lookupAddress = false } = opts;
      const m = mapRef.current;
      const mk = markerRef.current;
      if (!m || !mk) return;
      mk.setLatLng([lat, lng]);
      m.invalidateSize();
      m.flyTo([lat, lng], 17, { duration: 0.75 });
      onChangeRef.current({ lat, lng });
      setGeoHint(null);
      if (!lookupAddress || !onAddressChangeRef.current) return;
      try {
        const address = await reverseGeocode(lat, lng);
        if (destroyed) return;
        onAddressChangeRef.current(address);
        if (!address.street && !address.neighborhood && !address.zipCode) {
          setGeoHint('Localização marcada, mas não encontramos rua/bairro para preencher automaticamente.');
        }
      } catch {
        if (!destroyed) setGeoHint('Localização marcada. Não foi possível preencher o endereço automaticamente.');
      }
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
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          await applyGeoPosition(lat, lng, { lookupAddress: !silent });
          if (!silent && !destroyed) setGeoLoading(false);
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
        void applyGeoPosition(pos.coords.latitude, pos.coords.longitude);
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
      let shouldEmit = false;
      map.invalidateSize();
      try {
        if (polyLayer) {
          const b = polyLayer.getBounds();
          map.fitBounds(b.pad(0.1));
          if (savedLat != null && savedLng != null) {
            marker.setLatLng([savedLat, savedLng]);
          } else {
            marker.setLatLng(b.getCenter());
          }
          shouldEmit = true;
        } else if (savedLat != null && savedLng != null) {
          marker.setLatLng([savedLat, savedLng]);
          map.setView([savedLat, savedLng], 16);
          shouldEmit = true;
        } else {
          map.setView([fallback[0], fallback[1]], 14);
        }
      } catch {
        map.setView([fallback[0], fallback[1]], 14);
        if (savedLat != null && savedLng != null) {
          marker.setLatLng([savedLat, savedLng]);
          shouldEmit = true;
        }
      }
      if (shouldEmit) emit();
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
      destroyed = true;
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
