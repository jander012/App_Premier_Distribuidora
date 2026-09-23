import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { pointInPolygonRing, ringBBoxCenterLatLng } from '../utils/pointInPolygon.js';

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

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 };
const STORE_ICON = L.divIcon({
  className: 'checkout-map-icon checkout-map-icon--store',
  html: '<span>Loja</span>',
  iconSize: [52, 24],
  iconAnchor: [26, 24],
});

const CUSTOMER_ICON = L.divIcon({
  className: 'checkout-map-icon checkout-map-icon--customer',
  html: '<span>Entrega</span>',
  iconSize: [70, 24],
  iconAnchor: [35, 24],
});

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

function normalizeSearchAddress(data) {
  return normalizeReverseAddress(data);
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

async function searchAddress(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('q', query);
  url.searchParams.set('accept-language', 'pt-BR,pt');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('geocode_failed');
  const rows = await res.json();
  const hit = Array.isArray(rows) ? rows[0] : null;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('address_not_found');
  return { lat, lng, address: normalizeSearchAddress(hit) };
}

/**
 * @param {{
 *   polygon?: object|null,
 *   polygonZones?: Array<{ geojson: object|null }>|null,
 *   initialLat?: number|null,
 *   initialLng?: number|null,
 *   addressQuery?: string,
 *   storeOriginLat?: number|null,
 *   storeOriginLng?: number|null,
 *   storeOriginLabel?: string,
 *   onChange: (v: {lat:number,lng:number}) => void,
 *   onAddressChange?: (v: object) => void,
 * }} props
 */
export function CheckoutDeliveryMap({
  polygon,
  polygonZones,
  initialLat,
  initialLng,
  addressQuery,
  storeOriginLat,
  storeOriginLng,
  storeOriginLabel,
  onChange,
  onAddressChange,
}) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onAddressChangeRef = useRef(onAddressChange);
  const addressQueryRef = useRef(addressQuery);
  onChangeRef.current = onChange;
  onAddressChangeRef.current = onAddressChange;
  addressQueryRef.current = addressQuery;

  const [geoHint, setGeoHint] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const runGeoRef = useRef(() => {});
  const runAddressSearchRef = useRef(() => {});

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return undefined;
    let destroyed = false;

    const zonePolygons = (polygonZones || []).map((z) => z?.geojson).filter((p) => p?.type === 'Polygon');
    const polygons = zonePolygons.length > 0 ? zonePolygons : polygon?.type === 'Polygon' ? [polygon] : [];
    const hasPolygon = polygons.length > 0 && polygons[0].coordinates?.[0]?.length >= 3;
    const ring = hasPolygon ? polygons[0].coordinates[0] : null;
    const fallback = ring?.length ? ringBBoxCenterLatLng(ring) : [-15.78, -47.93];
    const savedLat = Number.isFinite(Number(initialLat)) ? Number(initialLat) : null;
    const savedLng = Number.isFinite(Number(initialLng)) ? Number(initialLng) : null;
    const hasSeedCoords = savedLat != null && savedLng != null;
    const originLat = Number.isFinite(Number(storeOriginLat)) ? Number(storeOriginLat) : null;
    const originLng = Number.isFinite(Number(storeOriginLng)) ? Number(storeOriginLng) : null;
    const hasOrigin = originLat != null && originLng != null;
    const startCenter = hasSeedCoords
      ? [savedLat, savedLng]
      : hasOrigin
        ? [originLat, originLng]
        : [fallback[0], fallback[1]];

    // Leaflet exige centro + zoom antes de flyTo/fitBounds.
    const map = L.map(wrapRef.current, {
      zoomControl: true,
      center: startCenter,
      zoom: 14,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const polygonCollection = {
      type: 'FeatureCollection',
      features: polygons.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
    };
    const polyLayer = hasPolygon
      ? L.geoJSON(polygonCollection, {
          style: { color: '#171717', weight: 2, fillColor: '#fbbc23', fillOpacity: 0.12 },
        }).addTo(map)
      : null;

    const marker = L.marker(startCenter, { draggable: true, icon: CUSTOMER_ICON }).addTo(map);
    markerRef.current = marker;
    marker.bindTooltip('Ponto de entrega', { direction: 'top', offset: [0, -22] });

    if (hasOrigin) {
      const originMarker = L.marker([originLat, originLng], { icon: STORE_ICON, interactive: false }).addTo(map);
      originMarker.bindTooltip(storeOriginLabel || 'Origem da loja', { direction: 'top', offset: [0, -20] });
      originMarkerRef.current = originMarker;
    }

    const updateStoreCustomerLine = () => {
      if (!hasOrigin) return;
      const ll = marker.getLatLng();
      const points = [
        [originLat, originLng],
        [ll.lat, ll.lng],
      ];
      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(points);
      } else {
        routeLineRef.current = L.polyline(points, {
          color: '#171717',
          weight: 3,
          opacity: 0.7,
          dashArray: '6 7',
        }).addTo(map);
      }
    };

    const emit = (opts = {}) => {
      const ll = marker.getLatLng();
      const loc = { lat: ll.lat, lng: ll.lng };
      updateStoreCustomerLine();
      onChangeRef.current(loc);
      if (opts.fitWithOrigin && hasOrigin) {
        map.fitBounds(
          L.latLngBounds([
            [originLat, originLng],
            [ll.lat, ll.lng],
          ]).pad(0.25)
        );
      }
    };
    marker.on('dragend', emit);
    map.on('click', (ev) => {
      marker.setLatLng(ev.latlng);
      emit();
      setGeoHint(null);
    });

    const applyGeoPosition = async (lat, lng, opts = {}) => {
      const { lookupAddress = false, fitWithOrigin = false } = opts;
      const m = mapRef.current;
      const mk = markerRef.current;
      if (!m || !mk) return;
      mk.setLatLng([lat, lng]);
      m.invalidateSize();
      if (fitWithOrigin && hasOrigin) {
        m.fitBounds(
          L.latLngBounds([
            [originLat, originLng],
            [lat, lng],
          ]).pad(0.25)
        );
      } else {
        m.flyTo([lat, lng], 17, { duration: 0.75 });
      }
      updateStoreCustomerLine();
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

    const layoutMap = () => {
      let shouldEmit = false;
      map.invalidateSize();
      try {
        if (polyLayer) {
          const b = polyLayer.getBounds();
          map.fitBounds(b.pad(0.1));
          if (savedLat != null && savedLng != null) {
            marker.setLatLng([savedLat, savedLng]);
            shouldEmit = true;
          } else {
            marker.setLatLng(b.getCenter());
          }
        } else if (savedLat != null && savedLng != null) {
          marker.setLatLng([savedLat, savedLng]);
          map.setView([savedLat, savedLng], 16);
          shouldEmit = true;
        } else if (hasOrigin) {
          map.setView([originLat, originLng], 14);
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
      updateStoreCustomerLine();
      if (shouldEmit) emit({ fitWithOrigin: true });
    };

    map.whenReady(() => {
      requestAnimationFrame(() => {
        layoutMap();
        requestAnimationFrame(() => {
          layoutMap();
        });
      });
    });

    mapRef.current = map;

    const runGeo = () => requestDevicePosition({ silent: false });
    const runAddressSearch = async () => {
      const query = String(addressQueryRef.current || '').trim();
      if (!query) {
        setGeoHint('Preencha rua, número, bairro ou CEP antes de buscar no mapa.');
        return;
      }
      setGeoHint(null);
      setSearchLoading(true);
      try {
        const hit = await searchAddress(query);
        if (destroyed) return;
        await applyGeoPosition(hit.lat, hit.lng, { fitWithOrigin: true });
        if (onAddressChangeRef.current) onAddressChangeRef.current(hit.address);
      } catch {
        if (!destroyed) setGeoHint('Endereço não encontrado no mapa. Tente incluir bairro, cidade, UF ou CEP.');
      } finally {
        if (!destroyed) setSearchLoading(false);
      }
    };

    runGeoRef.current = runGeo;
    runAddressSearchRef.current = runAddressSearch;

    return () => {
      destroyed = true;
      runGeoRef.current = () => {};
      runAddressSearchRef.current = () => {};
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      originMarkerRef.current = null;
      routeLineRef.current = null;
    };
  }, [polygon, polygonZones, initialLat, initialLng, storeOriginLat, storeOriginLng, storeOriginLabel]);

  return (
    <div>
      <div className="checkout-map-actions" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={searchLoading}
          onClick={() => runAddressSearchRef.current()}
        >
          {searchLoading ? 'Buscando endereço…' : 'Buscar endereço no mapa'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={geoLoading}
          onClick={() => runGeoRef.current()}
        >
          {geoLoading ? 'Obtendo localização…' : 'Usar localização atual do aparelho'}
        </button>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 6, marginBottom: 0 }}>
          Para entregar em outro endereço, preencha os campos e toque em buscar. Use a localização do aparelho só se a
          entrega for onde você está agora.
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

export function isInsideAnyDeliveryPolygon(polygons, lat, lng) {
  const list = (polygons || []).filter((p) => p?.type === 'Polygon');
  if (!list.length) return true;
  return list.some((p) => isInsideDeliveryPolygon(p, lat, lng));
}
