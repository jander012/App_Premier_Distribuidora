import { useMemo, useState } from 'react';
import { useCart } from '../context/CartContext.jsx';

function findSimpleCartLine(summary, productId) {
  return (summary?.items || []).find(
    (item) =>
      item.productId === productId &&
      (!item.optionIds || item.optionIds.length === 0) &&
      !item.note
  );
}

export function ProductQtyControl({ productId, available = true, compact = false }) {
  const { summary, setProductQuantity } = useCart();
  const [busy, setBusy] = useState(false);

  const line = useMemo(() => findSimpleCartLine(summary, productId), [summary, productId]);
  const qty = line?.quantity ?? 0;

  async function applyQuantity(nextQty) {
    if (!available || busy) return;
    setBusy(true);
    try {
      await setProductQuantity(productId, nextQty);
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <div className={`product-qty product-qty--disabled${compact ? ' product-qty--compact' : ''}`}>
        <span className="muted">Indisponível</span>
      </div>
    );
  }

  return (
    <div className={`product-qty${compact ? ' product-qty--compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="qty product-qty__controls" aria-label="Quantidade no carrinho">
        <button
          type="button"
          aria-label="Diminuir quantidade"
          disabled={busy || qty <= 0}
          onClick={() => applyQuantity(qty - 1)}
        >
          −
        </button>
        <span aria-live="polite">{qty}</span>
        <button type="button" aria-label="Aumentar quantidade" disabled={busy} onClick={() => applyQuantity(qty + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
