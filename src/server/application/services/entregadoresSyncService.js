import bcrypt from 'bcryptjs';
import * as driverRepo from '../../infrastructure/repositories/driverRepository.js';
import {
  entregadoresCadastroUrl,
  fetchRemoteEntregadores,
  isEntregadoresRemoteConfigured,
} from '../../infrastructure/integrations/entregadores/premierEntregadoresClient.js';

let placeholderHashPromise = null;

async function placeholderPasswordHash() {
  if (!placeholderHashPromise) {
    placeholderHashPromise = bcrypt.hash(`external-only-${Date.now()}-${Math.random()}`, 10);
  }
  return placeholderHashPromise;
}

export function remoteEntregadoresEnabled() {
  return isEntregadoresRemoteConfigured();
}

export function cadastroUrl() {
  return entregadoresCadastroUrl();
}

/**
 * Busca no Premier e espelha em delivery_drivers da loja.
 */
export async function syncStoreDriversFromPremier(storeId) {
  const remote = await fetchRemoteEntregadores();
  const hash = await placeholderPasswordHash();
  await driverRepo.syncExternalEntregadores(storeId, remote, { passwordHashFallback: hash });
  return {
    source: 'premier',
    cadastroUrl: cadastroUrl(),
    remoteCount: remote.length,
    drivers: await driverRepo.listDrivers(storeId),
  };
}
