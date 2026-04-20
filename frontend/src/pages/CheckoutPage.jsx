import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setClientToken, getClientToken } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore } from '../context/StoreContext.jsx';
import { CheckoutDeliveryMap, isInsideDeliveryPolygon } from '../components/CheckoutDeliveryMap.jsx';

const PAYMENTS = [
  { code: 'pix_online', label: 'PIX (online)' },
  { code: 'pix_delivery', label: 'PIX na entrega' },
  { code: 'debit_card', label: 'Cartão de débito na entrega' },
  { code: 'credit_card', label: 'Cartão de crédito na entrega' },
  { code: 'cash', label: 'Dinheiro na entrega' },
];

function checkoutPinStorageKey(storeSlug) {
  return `delivery_checkout_pin:${storeSlug || 'principal'}`;
}

export function CheckoutPage() {
  const nav = useNavigate();
  const { storeSlug } = useStore();
  const { phone, setPhone, summary, deliveryKm, setDeliveryKm, deliveryPublic, setDeliveryDest } = useCart();
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [sessionReady, setSessionReady] = useState(!!getClientToken());

  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');

  /** Ponto de entrega (obrigatório quando a loja definiu polígono). */
  const [deliveryPin, setDeliveryPin] = useState(null);
  const [savedAddrLat, setSavedAddrLat] = useState(null);
  const [savedAddrLng, setSavedAddrLng] = useState(null);
  /** Coordenadas restauradas desta sessão (último pino neste aparelho / loja). */
  const [sessionPinLat, setSessionPinLat] = useState(null);
  const [sessionPinLng, setSessionPinLng] = useState(null);

  const [paymentMethodCode, setPayment] = useState('pix_delivery');
  const [changeNeeded, setChangeNeeded] = useState(false);
  const [changeForAmount, setChangeForAmount] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponErr, setCouponErr] = useState(null);

  useEffect(() => {
    if (!sessionReady || !getClientToken()) return;
    let on = true;
    (async () => {
      setLoadingProfile(true);
      try {
        const data = await api.clientGet('/customers/me');
        if (!on) return;
        if (data.customer) {
          setFullName(data.customer.fullName || '');
          setCpf(data.customer.cpf || '');
          setEmail(data.customer.email || '');
        }
        if (data.address) {
          setStreet(data.address.street || '');
          setNumber(data.address.number || '');
          setNeighborhood(data.address.neighborhood || '');
          setZipCode(data.address.zipCode || '');
          setComplement(data.address.complement || '');
          setReference(data.address.reference || '');
          if (data.address.latitude != null && data.address.longitude != null) {
            const la = Number(data.address.latitude);
            const ln = Number(data.address.longitude);
            if (Number.isFinite(la) && Number.isFinite(ln)) {
              setSavedAddrLat(la);
              setSavedAddrLng(ln);
            }
          }
        }
      } catch {
        /* sem cadastro ainda */
      } finally {
        if (on) setLoadingProfile(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [sessionReady]);

  useEffect(() => {
    const key = checkoutPinStorageKey(storeSlug);
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const j = JSON.parse(raw);
      const la = Number(j?.lat);
      const ln = Number(j?.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      setSessionPinLat(la);
      setSessionPinLng(ln);
      setDeliveryPin((prev) => prev ?? { lat: la, lng: ln });
    } catch {
      /* ignore */
    }
  }, [storeSlug]);

  useEffect(() => {
    if (!deliveryPin || !Number.isFinite(deliveryPin.lat) || !Number.isFinite(deliveryPin.lng)) return;
    try {
      sessionStorage.setItem(
        checkoutPinStorageKey(storeSlug),
        JSON.stringify({ lat: deliveryPin.lat, lng: deliveryPin.lng })
      );
    } catch {
      /* quota / private mode */
    }
  }, [storeSlug, deliveryPin]);

  const hasDeliveryPolygon =
    deliveryPublic?.deliveryAreaPolygon?.type === 'Polygon' &&
    deliveryPublic.deliveryAreaPolygon.coordinates?.[0]?.length >= 3;
  const taxaUsaRotaNoMapa =
    Boolean(deliveryPublic?.deliveryPricingUsesRoute) && Boolean(hasDeliveryPolygon);

  useEffect(() => {
    if (deliveryPin && Number.isFinite(deliveryPin.lat) && Number.isFinite(deliveryPin.lng)) {
      setDeliveryDest(deliveryPin);
      return;
    }
    if (hasDeliveryPolygon) setDeliveryDest(null);
  }, [deliveryPin, hasDeliveryPolygon, setDeliveryDest]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponErr(null);
  }, [summary?.subtotal, summary?.deliveryFee, summary?.total]);

  async function applyCoupon() {
    setCouponErr(null);
    if (!getClientToken() || !summary) {
      setCouponErr('Confirme o celular e aguarde o total do carrinho.');
      return;
    }
    const code = couponInput.trim();
    if (!code) {
      setCouponErr('Digite o código do cupom.');
      return;
    }
    setCouponBusy(true);
    try {
      const res = await api.clientPost('/customers/me/validate-coupon', {
        storeSlug,
        code,
        subtotal: summary.subtotal,
        deliveryFee: summary.deliveryFee,
      });
      setAppliedCoupon({
        code,
        discountAmount: Number(res.discountAmount),
        couponId: res.couponId,
      });
    } catch (e) {
      setAppliedCoupon(null);
      setCouponErr(e.message || 'Cupom inválido');
    } finally {
      setCouponBusy(false);
    }
  }

  async function requestOtp() {
    setSubmitErr(null);
    setOtpHint('');
    if (!phone || phone.length < 10) {
      setSubmitErr('Informe um celular válido com DDD');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/client/request-code', { phone });
      setOtpSent(true);
      if (res.debugCode) setOtpHint(`Código de teste: ${res.debugCode}`);
    } catch (e) {
      setSubmitErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setSubmitErr(null);
    setBusy(true);
    try {
      const res = await api.post('/auth/client/verify-code', { phone, code: otpCode });
      setClientToken(res.clientToken);
      setSessionReady(true);
    } catch (e) {
      setSubmitErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitErr(null);
    if (!getClientToken()) {
      setSubmitErr('Confirme o código enviado ao seu celular');
      return;
    }
    const paymentMeta =
      paymentMethodCode === 'cash'
        ? {
            changeNeeded,
            changeForAmount: changeNeeded ? Number(String(changeForAmount).replace(',', '.')) : undefined,
          }
        : {};

    const poly = deliveryPublic?.deliveryAreaPolygon;
    if (poly?.type === 'Polygon' && poly.coordinates?.[0]?.length) {
      if (!deliveryPin || !Number.isFinite(deliveryPin.lat) || !Number.isFinite(deliveryPin.lng)) {
        setSubmitErr('Marque no mapa onde será a entrega.');
        return;
      }
      if (!isInsideDeliveryPolygon(poly, deliveryPin.lat, deliveryPin.lng)) {
        setSubmitErr('O ponto marcado está fora da área de entrega da loja.');
        return;
      }
    }

    setBusy(true);
    try {
      const kmRaw = deliveryKm.trim().replace(',', '.');
      const kmNum = kmRaw === '' ? NaN : Number(kmRaw);
      const orderBody = {
        paymentMethodCode,
        paymentMeta,
        customer: { fullName, cpf, email },
        address: {
          street,
          number,
          neighborhood,
          zipCode,
          complement,
          reference,
          ...(deliveryPin && Number.isFinite(deliveryPin.lat) && Number.isFinite(deliveryPin.lng)
            ? { latitude: deliveryPin.lat, longitude: deliveryPin.lng }
            : {}),
        },
      };
      if (!taxaUsaRotaNoMapa && !Number.isNaN(kmNum) && kmNum >= 0) {
        orderBody.deliveryDistanceKm = kmNum;
      }
      if (appliedCoupon?.code) {
        orderBody.couponCode = appliedCoupon.code;
      }
      const res = await api.postOrder(orderBody);
      nav(`/pedido/${res.order.id}`, { state: res });
    } catch (err) {
      setSubmitErr(err.message + (err.details?.missing ? ` — faltando: ${err.details.missing.join(', ')}` : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link to="/carrinho" className="muted" style={{ fontSize: '0.9rem' }}>
        ← Carrinho
      </Link>
      <h1 className="page-title">Checkout</h1>

      {summary && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="row-between">
            <span className="muted">Subtotal</span>
            <span>R$ {Number(summary.subtotal).toFixed(2)}</span>
          </div>
          <div className="row-between">
            <span className="muted">Entrega</span>
            <span>R$ {Number(summary.deliveryFee).toFixed(2)}</span>
          </div>
          {appliedCoupon && appliedCoupon.discountAmount > 0 && (
            <div className="row-between" style={{ color: 'var(--accent, #16a34a)' }}>
              <span>Cupom ({appliedCoupon.code})</span>
              <span>− R$ {Number(appliedCoupon.discountAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="row-between" style={{ marginTop: '0.35rem', fontWeight: 700 }}>
            <span>Total</span>
            <span className="price">
              R${' '}
              {Number(
                Math.max(0, Number(summary.subtotal) + Number(summary.deliveryFee) - (appliedCoupon?.discountAmount || 0))
              ).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {!sessionReady && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Confirmar celular
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
            Enviamos um código para validar seu número (em produção, via WhatsApp/SMS).
          </p>
          <div className="field">
            <label>Celular (WhatsApp) *</label>
            <input
              inputMode="numeric"
              placeholder="11999990000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {!otpSent ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={requestOtp}>
              Receber código
            </button>
          ) : (
            <>
              {otpHint && <p className="muted" style={{ fontSize: '0.85rem' }}>{otpHint}</p>}
              <div className="field">
                <label>Código de 6 dígitos *</label>
                <input
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                />
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={verifyOtp}>
                Confirmar código
              </button>
            </>
          )}
        </div>
      )}

      {sessionReady && (
        <form onSubmit={submit} className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Seus dados
          </div>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Celular verificado. Os dados abaixo são salvos para os próximos pedidos.
          </p>
          {loadingProfile && <p className="muted">Carregando seus dados…</p>}
          <div className="field">
            <label>Nome completo *</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="field">
            <label>CPF *</label>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} required />
          </div>
          <div className="field">
            <label>E-mail *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="section-label">Endereço de entrega</div>
          <div className="field">
            <label>Rua *</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} required />
          </div>
          <div className="field">
            <label>Número *</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} required />
          </div>
          <div className="field">
            <label>Bairro *</label>
            <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} required />
          </div>
          <div className="field">
            <label>CEP *</label>
            <input value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
          </div>
          <div className="field">
            <label>Complemento</label>
            <input value={complement} onChange={(e) => setComplement(e.target.value)} />
          </div>
          <div className="field">
            <label>Referência</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          {deliveryPublic?.deliveryAreaPolygon?.type === 'Polygon' &&
            deliveryPublic.deliveryAreaPolygon.coordinates?.[0]?.length >= 3 && (
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <div className="section-label">Local da entrega no mapa *</div>
                <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
                  Guardamos o último ponto neste aparelho (por loja). Se o navegador já tiver permissão de
                  localização, o mapa tenta ir para onde você está. Ajuste o marcador se precisar; só aceitamos
                  pedidos dentro da área destacada.
                </p>
                <CheckoutDeliveryMap
                  key={`dm-${savedAddrLat ?? sessionPinLat ?? 'x'}-${savedAddrLng ?? sessionPinLng ?? 'y'}`}
                  polygon={deliveryPublic.deliveryAreaPolygon}
                  initialLat={savedAddrLat ?? sessionPinLat}
                  initialLng={savedAddrLng ?? sessionPinLng}
                  onChange={setDeliveryPin}
                />
              </div>
            )}

          {taxaUsaRotaNoMapa && (
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0, marginBottom: 0 }}>
              A taxa por faixa de distância usa a <strong>rota de carro</strong> entre a origem da loja (marcada no
              painel) e o pino de entrega no mapa acima — não o raio em linha reta.
            </p>
          )}

          {deliveryPublic?.deliveryUseDistanceZones && !taxaUsaRotaNoMapa && (
            <div className="field">
              <label>
                Distância até o endereço (km)
                {deliveryPublic?.deliveryRequireDistanceKm ? ' *' : ''}
              </label>
              <input
                inputMode="decimal"
                value={deliveryKm}
                onChange={(e) => setDeliveryKm(e.target.value)}
                placeholder="Ex.: 4,5"
                required={Boolean(deliveryPublic?.deliveryRequireDistanceKm)}
              />
              <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Informe o km quando a loja ainda não usa mapa + origem para rota. Ajuste também no carrinho se
                precisar.
              </p>
            </div>
          )}

          <div className="section-label">Cupom de desconto</div>
          <div className="field" style={{ marginBottom: '0.75rem' }}>
            <label>Código do cupom</label>
            <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                style={{ flex: 1, minWidth: 160 }}
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Ex.: PROMO10"
                disabled={!sessionReady}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto' }}
                disabled={!sessionReady || couponBusy || !summary}
                onClick={applyCoupon}
              >
                {couponBusy ? 'Validando…' : 'Aplicar'}
              </button>
            </div>
            {couponErr && <p className="err" style={{ marginTop: 6, marginBottom: 0 }}>{couponErr}</p>}
            {appliedCoupon && !couponErr && (
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
                Cupom aplicado. O desconto será confirmado ao finalizar o pedido.
              </p>
            )}
          </div>

          <div className="section-label">Pagamento</div>
          <div className="field">
            <label>Forma de pagamento</label>
            <select value={paymentMethodCode} onChange={(e) => setPayment(e.target.value)}>
              {PAYMENTS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {paymentMethodCode === 'cash' && (
            <>
              <label className="row-between" style={{ cursor: 'pointer', marginBottom: '0.75rem' }}>
                <span>Precisa de troco?</span>
                <input type="checkbox" checked={changeNeeded} onChange={(e) => setChangeNeeded(e.target.checked)} />
              </label>
              {changeNeeded && (
                <div className="field">
                  <label>Troco para quanto? (R$) *</label>
                  <input
                    inputMode="decimal"
                    value={changeForAmount}
                    onChange={(e) => setChangeForAmount(e.target.value)}
                    required={changeNeeded}
                  />
                </div>
              )}
            </>
          )}

          {submitErr && <p className="err">{submitErr}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Enviando…' : 'Confirmar pedido'}
          </button>
        </form>
      )}
    </div>
  );
}
