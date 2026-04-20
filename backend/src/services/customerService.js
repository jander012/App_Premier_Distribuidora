import * as repo from '../repositories/customerRepository.js';
import { normalizePhone } from '../utils/phone.js';
import { AppError } from '../utils/AppError.js';

const REQUIRED = ['fullName', 'cpf', 'email', 'street', 'number', 'neighborhood', 'zipCode'];

export function isCustomerComplete(customer, address) {
  if (!customer?.full_name?.trim() || !customer?.cpf?.trim() || !customer?.email?.trim()) {
    return false;
  }
  if (
    !address?.street?.trim() ||
    !address?.number?.trim() ||
    !address?.neighborhood?.trim() ||
    !address?.zip_code?.trim()
  ) {
    return false;
  }
  return true;
}

export function missingFields(customer, address) {
  const m = [];
  if (!customer?.full_name?.trim()) m.push('fullName');
  if (!customer?.cpf?.trim()) m.push('cpf');
  if (!customer?.email?.trim()) m.push('email');
  if (!address?.street?.trim()) m.push('street');
  if (!address?.number?.trim()) m.push('number');
  if (!address?.neighborhood?.trim()) m.push('neighborhood');
  if (!address?.zip_code?.trim()) m.push('zipCode');
  return m;
}

export async function getByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(400, 'Telefone inválido');
  const customer = await repo.findByPhone(phone);
  if (!customer) return { phone, customer: null, address: null };
  const address = await repo.getDefaultAddress(customer.id);
  return {
    phone,
    customer,
    address,
    complete: isCustomerComplete(customer, address),
    missing: missingFields(customer, address),
  };
}

export async function createCustomer(payload) {
  const phone = normalizePhone(payload.phone);
  if (!phone) throw new AppError(400, 'Telefone inválido');
  return createCustomerForVerifiedPhone(phone, payload);
}

/** Cadastro após OTP — telefone já validado no token. */
export async function createCustomerForVerifiedPhone(phoneDigits, payload) {
  const existing = await repo.findByPhone(phoneDigits);
  if (existing) throw new AppError(409, 'Cliente já cadastrado com este telefone');
  for (const k of ['fullName', 'cpf', 'email', 'street', 'number', 'neighborhood', 'zipCode']) {
    if (!payload[k]?.toString?.().trim?.()) {
      throw new AppError(400, `Campo obrigatório: ${k}`);
    }
  }
  const c = await repo.createCustomer({
    phone: phoneDigits,
    fullName: payload.fullName.trim(),
    cpf: payload.cpf.trim(),
    email: payload.email.trim(),
  });
  const addr = await repo.upsertDefaultAddress(c.id, {
    street: payload.street,
    number: payload.number,
    neighborhood: payload.neighborhood,
    zipCode: payload.zipCode,
    complement: payload.complement,
    reference: payload.reference,
    latitude: payload.latitude ?? payload.lat,
    longitude: payload.longitude ?? payload.lng,
  });
  return { customer: c, address: addr };
}

export async function updateCustomer(id, payload) {
  const existing = await repo.findById(id);
  if (!existing) throw new AppError(404, 'Cliente não encontrado');
  const c = await repo.updateCustomer(id, {
    fullName: 'fullName' in payload ? payload.fullName?.trim() || null : null,
    cpf: 'cpf' in payload ? payload.cpf?.trim() || null : null,
    email: 'email' in payload ? payload.email?.trim() || null : null,
  });
  return c;
}

export async function addAddress(customerId, payload) {
  return repo.upsertDefaultAddress(customerId, payload);
}

export async function updateAddress(addressId, customerId, payload) {
  const row = await repo.updateAddress(addressId, customerId, payload);
  if (!row) throw new AppError(404, 'Endereço não encontrado');
  return row;
}

/** Mescla dados do body com cliente existente e garante persistência completa para pedido. */
export async function ensureCustomerForOrder(phoneDigits, body) {
  let customer = await repo.findByPhone(phoneDigits);
  const addrInput = body.address || {};
  const custInput = body.customer || {};

  if (!customer) {
    const merged = {
      phone: phoneDigits,
      fullName: custInput.fullName || body.fullName,
      cpf: custInput.cpf || body.cpf,
      email: custInput.email || body.email,
      street: addrInput.street || body.street,
      number: addrInput.number || body.number,
      neighborhood: addrInput.neighborhood || body.neighborhood,
      zipCode: addrInput.zipCode || body.zipCode,
      complement: addrInput.complement ?? body.complement,
      reference: addrInput.reference ?? body.reference,
      latitude: addrInput.latitude ?? addrInput.lat ?? body.latitude ?? body.lat,
      longitude: addrInput.longitude ?? addrInput.lng ?? body.longitude ?? body.lng,
    };
    for (const k of REQUIRED) {
      const key =
        k === 'fullName'
          ? merged.fullName
          : k === 'zipCode'
            ? merged.zipCode
            : merged[k];
      if (!key?.toString?.().trim?.()) {
        throw new AppError(400, 'Dados obrigatórios incompletos para primeiro pedido', {
          missing: [k],
        });
      }
    }
    customer = await repo.createCustomer({
      phone: phoneDigits,
      fullName: merged.fullName.trim(),
      cpf: merged.cpf.trim(),
      email: merged.email.trim(),
    });
    const address = await repo.upsertDefaultAddress(customer.id, {
      street: merged.street,
      number: merged.number,
      neighborhood: merged.neighborhood,
      zipCode: merged.zipCode,
      complement: merged.complement,
      reference: merged.reference,
      latitude: merged.latitude,
      longitude: merged.longitude,
    });
    return { customer, address };
  }

  await repo.updateCustomer(customer.id, {
    fullName:
      custInput.fullName !== undefined ? custInput.fullName.trim() || null : null,
    cpf: custInput.cpf !== undefined ? custInput.cpf.trim() || null : null,
    email: custInput.email !== undefined ? custInput.email.trim() || null : null,
  });
  customer = await repo.findById(customer.id);

  let address = await repo.getDefaultAddress(customer.id);
  if (
    addrInput.street ||
    addrInput.number ||
    addrInput.neighborhood ||
    addrInput.zipCode ||
    body.street
  ) {
    address = await repo.upsertDefaultAddress(customer.id, {
      street: addrInput.street || body.street || address?.street,
      number: addrInput.number || body.number || address?.number,
      neighborhood: addrInput.neighborhood || body.neighborhood || address?.neighborhood,
      zipCode: addrInput.zipCode || body.zipCode || address?.zip_code,
      complement: addrInput.complement ?? body.complement ?? address?.complement,
      reference: addrInput.reference ?? body.reference ?? address?.reference_note,
      latitude: addrInput.latitude ?? addrInput.lat ?? body.latitude ?? body.lat ?? address?.latitude,
      longitude: addrInput.longitude ?? addrInput.lng ?? body.longitude ?? body.lng ?? address?.longitude,
    });
  }

  if (!isCustomerComplete(customer, address)) {
    throw new AppError(400, 'Complete seu cadastro antes de finalizar o pedido', {
      missing: missingFields(customer, address),
    });
  }

  return { customer, address };
}

export async function listLinkedStoresForPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(400, 'Telefone inválido');
  const customer = await repo.findByPhone(phone);
  if (!customer) return [];
  return repo.listStoresForCustomer(customer.id);
}
