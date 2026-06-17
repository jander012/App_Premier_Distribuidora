import { Link } from '../navigation.js';
import { ProductQtyControl } from './ProductQtyControl.jsx';

export function MenuProductCard({ product, meta }) {
  if (!product) return null;

  return (
    <article className={`card menu-product-card ${!product.available ? 'unavailable' : ''}`}>
      <Link to={`/produto/${product.id}`} className="menu-product-card__media">
        {product.image_url ? (
          <img src={product.image_url} alt="" loading="lazy" />
        ) : (
          <div className="product-placeholder" />
        )}
      </Link>
      <div className="menu-product-card__body">
        <Link to={`/produto/${product.id}`} className="menu-product-card__name">
          {product.name}
        </Link>
        <div className="menu-product-card__price">R$ {Number(product.price).toFixed(2)}</div>
        {meta}
        <ProductQtyControl productId={product.id} available={product.available} />
      </div>
    </article>
  );
}
