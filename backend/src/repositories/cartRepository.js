import { query } from '../config/db.js';

export async function createCart(customerId = null) {
  const { rows } = await query(
    `INSERT INTO carts (customer_id) VALUES ($1) RETURNING *`,
    [customerId]
  );
  return rows[0];
}

export async function getCart(cartId) {
  const { rows } = await query(`SELECT * FROM carts WHERE id = $1`, [cartId]);
  return rows[0] || null;
}

export async function linkCartToCustomer(cartId, customerId) {
  await query(`UPDATE carts SET customer_id = $2, updated_at = now() WHERE id = $1`, [
    cartId,
    customerId,
  ]);
}

export async function listCartItems(cartId) {
  const { rows } = await query(
    `SELECT ci.*, p.name AS product_name, p.price AS base_price, p.available, p.store_id AS product_store_id
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = $1
     ORDER BY ci.id`,
    [cartId]
  );
  return rows;
}

export async function getProductStoreId(productId) {
  const { rows } = await query(`SELECT store_id FROM products WHERE id = $1`, [productId]);
  return rows[0]?.store_id ?? null;
}

export async function setCartStoreId(cartId, storeId) {
  await query(`UPDATE carts SET store_id = $2, updated_at = now() WHERE id = $1`, [cartId, storeId]);
}

export async function clearCartStoreIfEmpty(cartId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM cart_items WHERE cart_id = $1`, [cartId]);
  if ((rows[0]?.n ?? 0) === 0) {
    await query(`UPDATE carts SET store_id = NULL, updated_at = now() WHERE id = $1`, [cartId]);
  }
}

export async function getOptionExtras(productId, optionIds) {
  if (!optionIds?.length) return [];
  const { rows } = await query(
    `SELECT id, name, price_extra FROM product_options
     WHERE product_id = $1 AND id = ANY($2::int[]) AND active = true`,
    [productId, optionIds]
  );
  return rows;
}

export async function addCartItem({ cartId, productId, quantity, note, optionIds }) {
  const { rows } = await query(
    `INSERT INTO cart_items (cart_id, product_id, quantity, note, option_ids)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [cartId, productId, quantity, note || null, optionIds || []]
  );
  await query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);
  return rows[0];
}

export async function updateCartItem(cartId, itemId, { quantity, note, optionIds }) {
  const { rows } = await query(
    `UPDATE cart_items SET
       quantity = COALESCE($3, quantity),
       note = COALESCE($4, note),
       option_ids = COALESCE($5, option_ids),
       updated_at = now()
     WHERE id = $2 AND cart_id = $1 RETURNING *`,
    [cartId, itemId, quantity, note, optionIds]
  );
  return rows[0];
}

export async function deleteCartItem(cartId, itemId) {
  const { rows } = await query(
    `DELETE FROM cart_items WHERE id = $2 AND cart_id = $1 RETURNING cart_id`,
    [cartId, itemId]
  );
  if (rows[0]) {
    await query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [rows[0].cart_id]);
    await clearCartStoreIfEmpty(cartId);
  }
  return !!rows[0];
}

export async function clearCart(cartId) {
  await query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
  await query(`UPDATE carts SET store_id = NULL, updated_at = now() WHERE id = $1`, [cartId]);
}

export async function deleteCart(cartId) {
  await query(`DELETE FROM carts WHERE id = $1`, [cartId]);
}
