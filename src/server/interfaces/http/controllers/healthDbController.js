import { query } from '../../../infrastructure/config/db.js';

/** Diagnóstico: banco, tabela `store_delivery_polygons` e linhas (útil mesmo com NODE_ENV=production no .env local). */
export async function getHealthDb(req, res, next) {
  try {
    const { rows: db } = await query('SELECT DATABASE() AS name');
    const { rows: tab } = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'store_delivery_polygons'
      ) AS table_exists
    `);
    let polygonRowCount = null;
    let storeIdsWithPolygon = [];
    let tableQueryError = null;
    try {
      const { rows: cnt } = await query('SELECT COUNT(*) AS c FROM store_delivery_polygons');
      polygonRowCount = cnt[0]?.c ?? null;
      const { rows: ids } = await query(
        'SELECT store_id FROM store_delivery_polygons ORDER BY store_id'
      );
      storeIdsWithPolygon = ids.map((r) => r.store_id);
    } catch (e) {
      tableQueryError = e.message;
    }
    res.json({
      ok: true,
      database: db[0]?.name,
      tableStoreDeliveryPolygonsExists: Boolean(tab[0]?.table_exists),
      polygonRowCount,
      storeIdsWithPolygon,
      tableQueryError,
    });
  } catch (e) {
    next(e);
  }
}
