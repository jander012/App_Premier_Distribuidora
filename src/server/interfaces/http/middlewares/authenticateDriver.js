import { verifyDriverToken, passwordVersion } from '../../../application/services/tokenService.js';
import * as driverRepo from '../../../infrastructure/repositories/driverRepository.js';
import { AppError } from '../../../domain/shared/AppError.js';

export async function authenticateDriver(req, _res, next) {
  const auth = req.headers.authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return next(new AppError(401, 'Sessão do entregador ausente'));
  try {
    const session = verifyDriverToken(m[1]);
    const driver = await driverRepo.findDriverById(session.driverId, session.storeId);
    const active = driver && (driver.active === true || driver.active === 1);
    if (!active || session.pwv !== passwordVersion(driver.password_hash)) {
      throw new AppError(401, 'Sessão do entregador inválida ou expirada');
    }
    req.driverId = session.driverId;
    req.storeId = session.storeId;
    next();
  } catch (e) {
    next(e);
  }
}
