import * as storeRepo from '../repositories/storeRepository.js';

export async function listStores(req, res, next) {
  try {
    const rows = await storeRepo.listActiveStores();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}
