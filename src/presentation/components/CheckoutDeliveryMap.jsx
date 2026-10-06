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
const MAX_SEED_DISTANCE_M = 150_000;
const STORE_ICON = L.divIcon({
  className: 'checkout-map-icon checkout-map-icon--store',
  html: '<span>Loja</span>',
  iconSize: [52, 32],
  iconAnchor: [26, 32],
});

const CUSTOMER_ICON = L.divIcon({
  className: 'checkout-map-icon checkout-map-icon--customer',
  html: '<span>Entrega</span>',
  iconSize: [70, 32],
  iconAnchor: [35, 32],
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

async function nominatimSearch(query, { viewbox = null, limit = 5, geometry = false } = {}) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('q', query);
  url.searchParams.set('accept-language', 'pt-BR,pt');
  if (geometry) url.searchParams.set('polygon_geojson', '1');
  if (viewbox) {
    url.searchParams.set('viewbox', viewbox);
    url.searchParams.set('bounded', '1');
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('geocode_failed');
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : [])
    .map((hit) => ({ lat: Number(hit?.lat), lng: Number(hit?.lon), hit }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cityCenterCache = new Map();

async function cityCenter(city, state) {
  const key = `${city}|${state}`;
  if (cityCenterCache.has(key)) return cityCenterCache.get(key);
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('city', city);
  if (state) url.searchParams.set('state', state);
  let center = null;
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const rows = res.ok ? await res.json() : [];
    const lat = Number(rows?.[0]?.lat);
    const lng = Number(rows?.[0]?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) center = L.latLng(lat, lng);
  } catch {
    center = null;
  }
  if (center) cityCenterCache.set(key, center);
  return center;
}

/** Maior trecho da rua como lista de L.LatLng (GeoJSON vem em [lng, lat]). */
function streetLine(geojson) {
  if (geojson?.type === 'LineString') return geojson.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
  if (geojson?.type === 'MultiLineString') {
    const parts = geojson.coordinates.map((c) => c.map(([lng, lat]) => L.latLng(lat, lng)));
    return parts.sort((a, b) => lineLength(b) - lineLength(a))[0] || null;
  }
  return null;
}

function lineLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += pts[i - 1].distanceTo(pts[i]);
  return total;
}

function pointAlong(pts, meters) {
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const seg = pts[i - 1].distanceTo(pts[i]);
    if (acc + seg >= meters) {
      const t = seg > 0 ? (meters - acc) / seg : 0;
      return L.latLng(
        pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t,
        pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t
      );
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

/**
 * O OSM raramente tem número de casa. Muitas cidades usam numeração métrica (nº ≈ metros desde o
 * início da rua, que costuma ser a ponta mais próxima do centro). Estima o ponto na rua por isso.
 */
async function estimateByHouseNumber(result, number, fallbackCenter = null) {
  const n = Number(String(number || '').replace(/\D/g, ''));
  const pts = streetLine(result?.hit?.geojson);
  if (!Number.isFinite(n) || n <= 0 || !pts || pts.length < 2) return null;
  const length = lineLength(pts);
  if (n > length * 1.15) return null;
  const addr = result.hit.address || {};
  const city = addr.city || addr.town || addr.municipality;
  let center = null;
  if (city) {
    if (!cityCenterCache.has(`${city}|${addr.state}`)) await sleep(1100);
    center = await cityCenter(city, addr.state);
  }
  if (!center && fallbackCenter) center = L.latLng(fallbackCenter);
  if (!center) return null;
  const startsAtFirst = pts[0].distanceTo(center) <= pts[pts.length - 1].distanceTo(center);
  const ordered = startsAtFirst ? pts : [...pts].reverse();
  const p = pointAlong(ordered, Math.min(n, length));
  return { lat: p.lat, lng: p.lng };
}

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** Consultas do mais completo ao mais simples; o OSM muitas vezes não tem o número da casa. */
function buildAddressQueries({ street, number, neighborhood, zipCode }) {
  const s = clean(street);
  const n = clean(number);
  const b = clean(neighborhood);
  const z = clean(zipCode).replace(/\D/g, '');
  const out = [];
  const add = (q, exact) => {
    if (q && !out.some((o) => o.q === q)) out.push({ q, exact });
  };
  if (s && n && b) add(`${s} ${n}, ${b}`, true);
  if (s && n) add(`${s} ${n}`, true);
  if (s && b) add(`${s}, ${b}`, false);
  if (s) add(s, false);
  if (z.length === 8) add(`${z.slice(0, 5)}-${z.slice(5)}`, false);
  if (b) add(b, false);
  return out;
}

/**
 * Busca o endereço priorizando a área atendida pela loja:
 * 1) dentro do retângulo da área (viewbox bounded), preferindo pontos dentro do polígono;
 * 2) sem limite, aceitando só resultados perto da área.
 */
async function searchAddress(parts, area) {
  const queries = buildAddressQueries(parts);
  if (!queries.length) throw new Error('address_empty');
  const inside = (r) => !area.polygons.length || area.polygons.some((p) => pointInPolygonRing(r.lng, r.lat, p.coordinates[0]));
  const isApprox = (r, exact) => !exact || !r?.hit?.address?.house_number;
  let first = true;
  const throttle = async () => {
    if (!first) await sleep(1100);
    first = false;
  };

  const finalize = async (r, exact, extra = {}) => {
    const out = { ...r, address: normalizeSearchAddress(r.hit), approximate: isApprox(r, exact), ...extra };
    if (out.approximate && r.hit?.category === 'highway' && parts.number) {
      const est = await estimateByHouseNumber(r, parts.number, area.center);
      if (est && inside(est)) return { ...out, lat: est.lat, lng: est.lng, estimated: true };
    }
    return out;
  };

  if (area.viewbox) {
    let bboxFallback = null;
    for (const { q, exact } of queries) {
      await throttle();
      const rows = await nominatimSearch(q, { viewbox: area.viewbox, geometry: true });
      const hit = rows.find(inside);
      if (hit) return finalize(hit, exact);
      if (!bboxFallback && rows[0]) bboxFallback = { row: rows[0], exact };
    }
    if (bboxFallback) {
      return finalize(bboxFallback.row, bboxFallback.exact, { outside: true });
    }
  }

  await throttle();
  const rows = await nominatimSearch(queries[0].q, { limit: 10, geometry: true });
  const near = area.center
    ? rows.filter((r) => L.latLng(area.center).distanceTo([r.lat, r.lng]) <= MAX_SEED_DISTANCE_M)
    : rows;
  const hit = near.find(inside) || near[0];
  if (!hit) throw new Error('address_not_found');
  return finalize(hit, queries[0].exact);
}

/**
 * @param {{
 *   polygon?: object|null,
 *   polygonZones?: Array<{ geojson: object|null }>|null,
 *   initialLat?: number|null,
 *   initialLng?: number|null,
 *   addressParts?: { street?: string, number?: string, neighborhood?: string, zipCode?: string },
 *   storeOriginLat?: number|null,
 *   storeOriginLng?: number|null,
 *   storeOriginLabel?: string,
 *   route?: { geometry: Array<[number, number]>, distanceKm: number, durationMinutes: number }|null,
 *   onChange: (v: {lat:number,lng:number}) => void,
 *   onAddressChange?: (v: object) => void,
 * }} props
 */
export function CheckoutDeliveryMap({
  polygon,
  polygonZones,
  initialLat,
  initialLng,
  addressParts,
  storeOriginLat,
  storeOriginLng,
  storeOriginLabel,
  route,
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
  const addressPartsRef = useRef(addressParts);
  onChangeRef.current = onChange;
  onAddressChangeRef.current = onAddressChange;
  addressPartsRef.current = addressParts;

  const [geoHint, setGeoHint] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mapGen, setMapGen] = useState(0);
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
    const originLat = Number.isFinite(Number(storeOriginLat)) ? Number(storeOriginLat) : null;
    const originLng = Number.isFinite(Number(storeOriginLng)) ? Number(storeOriginLng) : null;
    const hasOrigin = originLat != null && originLng != null;
    // Ponto salvo (cadastro/sessão) só vale se for plausível: dentro da área e perto da loja.
    const hasSeedCoords =
      savedLat != null &&
      savedLng != null &&
      (!hasPolygon || polygons.some((p) => pointInPolygonRing(savedLng, savedLat, p.coordinates[0]))) &&
      (!hasOrigin || L.latLng(originLat, originLng).distanceTo([savedLat, savedLng]) <= MAX_SEED_DISTANCE_M);
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

    // O pino de entrega só entra no mapa quando há um ponto real (salvo, buscado, GPS ou clique);
    // antes disso ele não pode "nascer" em cima da loja.
    const marker = L.marker(startCenter, { draggable: true, icon: CUSTOMER_ICON, zIndexOffset: 1000 });
    if (hasSeedCoords) marker.addTo(map);
    markerRef.current = marker;
    marker.bindTooltip('Ponto de entrega', { direction: 'top', offset: [0, -30] });
    const ensureMarkerOnMap = () => {
      if (!map.hasLayer(marker)) marker.addTo(map);
    };

    if (hasOrigin) {
      const originMarker = L.marker([originLat, originLng], { icon: STORE_ICON, interactive: false }).addTo(map);
      // Leaflet renders string content as HTML; the label is store-admin data, so pass a text node.
      originMarker.bindTooltip(document.createTextNode(storeOriginLabel || 'Origem da loja'), {
        direction: 'top',
        offset: [0, -28],
      });
      originMarkerRef.current = originMarker;
    }

    const emit = (opts = {}) => {
      const ll = marker.getLatLng();
      const loc = { lat: ll.lat, lng: ll.lng };
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
    marker.on('dragend', () => emit());
    map.on('click', (ev) => {
      marker.setLatLng(ev.latlng);
      ensureMarkerOnMap();
      emit();
      setGeoHint(null);
    });

    const applyGeoPosition = async (lat, lng, opts = {}) => {
      const { lookupAddress = false, fitWithOrigin = false } = opts;
      const m = mapRef.current;
      const mk = markerRef.current;
      if (!m || !mk) return;
      mk.setLatLng([lat, lng]);
      ensureMarkerOnMap();
      m.invalidateSize();
      if ((fitWithOrigin || lookupAddress) && hasOrigin) {
        m.fitBounds(
          L.latLngBounds([
            [originLat, originLng],
            [lat, lng],
          ]).pad(0.25)
        );
      } else {
        m.flyTo([lat, lng], 17, { duration: 0.75 });
      }
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
      if (destroyed) return;
      let shouldEmit = false;
      map.invalidateSize();
      try {
        if (hasSeedCoords) {
          marker.setLatLng([savedLat, savedLng]);
          ensureMarkerOnMap();
          shouldEmit = true;
          if (!hasOrigin) map.setView([savedLat, savedLng], 16);
        } else {
          let bounds = polyLayer ? polyLayer.getBounds() : null;
          if (hasOrigin) {
            bounds = bounds ? bounds.extend([originLat, originLng]) : null;
          }
          if (bounds?.isValid()) {
            map.fitBounds(bounds.pad(0.1));
          } else if (hasOrigin) {
            map.setView([originLat, originLng], 14);
          } else {
            map.setView([fallback[0], fallback[1]], 14);
          }
        }
      } catch {
        try {
          map.setView([fallback[0], fallback[1]], 14);
        } catch {
          return;
        }
        if (hasSeedCoords) {
          marker.setLatLng([savedLat, savedLng]);
          ensureMarkerOnMap();
          shouldEmit = true;
        }
      }
      if (shouldEmit) emit({ fitWithOrigin: true });
    };

    const rafIds = [];
    map.whenReady(() => {
      rafIds.push(
        requestAnimationFrame(() => {
          layoutMap();
          rafIds.push(requestAnimationFrame(layoutMap));
        })
      );
    });

    mapRef.current = map;
    setMapGen((g) => g + 1);

    const runGeo = () => requestDevicePosition({ silent: false });

    let searchArea = { polygons, viewbox: null, center: hasOrigin ? [originLat, originLng] : null };
    if (polyLayer) {
      const b = polyLayer.getBounds();
      searchArea = {
        polygons,
        viewbox: `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`,
        center: hasOrigin ? [originLat, originLng] : [b.getCenter().lat, b.getCenter().lng],
      };
    } else if (hasOrigin) {
      const d = 0.25;
      searchArea.viewbox = `${originLng - d},${originLat + d},${originLng + d},${originLat - d}`;
    }

    const runAddressSearch = async () => {
      const parts = addressPartsRef.current || {};
      const hasParts = ['street', 'neighborhood', 'zipCode'].some((k) => String(parts[k] || '').trim());
      if (!hasParts) {
        setGeoHint('Preencha rua, número, bairro ou CEP antes de buscar no mapa.');
        return;
      }
      setGeoHint(null);
      setSearchLoading(true);
      try {
        const hit = await searchAddress(parts, searchArea);
        if (destroyed) return;
        await applyGeoPosition(hit.lat, hit.lng, { fitWithOrigin: true });
        if (destroyed) return;
        if (hit.outside) {
          setGeoHint('Encontramos o endereço, mas fora da área atendida pela loja. Confira os dados ou ajuste o pino.');
        } else if (hit.estimated) {
          setGeoHint('Posição estimada pelo número na rua. Confira no mapa e arraste o pino se não for exatamente aí.');
        } else if (hit.approximate) {
          setGeoHint('Localizamos a rua/região, mas não o número exato. Arraste o pino ou toque no mapa no local da entrega.');
        }
      } catch {
        if (!destroyed) {
          setGeoHint(
            'Endereço não encontrado na área atendida. Confira rua e bairro, ou toque no mapa no local da entrega.'
          );
        }
      } finally {
        if (!destroyed) setSearchLoading(false);
      }
    };

    runGeoRef.current = runGeo;
    runAddressSearchRef.current = runAddressSearch;

    return () => {
      destroyed = true;
      rafIds.forEach((id) => cancelAnimationFrame(id));
      runGeoRef.current = () => {};
      runAddressSearchRef.current = () => {};
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      originMarkerRef.current = null;
      routeLineRef.current = null;
    };
  }, [polygon, polygonZones, initialLat, initialLng, storeOriginLat, storeOriginLng, storeOriginLabel]);

  const routeGeometry = route?.geometry;
  const routeGeometryRef = useRef(routeGeometry);
  routeGeometryRef.current = routeGeometry;
  const routeKey =
    Array.isArray(routeGeometry) && routeGeometry.length >= 2
      ? `${routeGeometry.length}:${routeGeometry[0].join(',')}:${routeGeometry[routeGeometry.length - 1].join(',')}`
      : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    const geometry = routeGeometryRef.current;
    if (!routeKey || !Array.isArray(geometry)) return;
    const line = L.polyline(geometry, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.85,
      lineJoin: 'round',
    }).addTo(map);
    routeLineRef.current = line;
    map.fitBounds(line.getBounds().pad(0.15));
  }, [routeKey, mapGen]);

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
      {route?.distanceKm != null && (
        <div className="checkout-route-badge">
          <strong>Menor rota: {Number(route.distanceKm).toFixed(1).replace('.', ',')} km</strong>
          {route.durationMinutes ? <span>~{route.durationMinutes} min de carro</span> : null}
        </div>
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
