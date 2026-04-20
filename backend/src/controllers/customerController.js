import * as customerService from '../services/customerService.js';
import * as repo from '../repositories/customerRepository.js';
import * as storeRepo from '../repositories/storeRepository.js';
import * as couponService from '../services/couponService.js';
import { AppError } from '../utils/AppError.js';

export async function getMyStores(req, res, next) {
  try {
    const rows = await customerService.listLinkedStoresForPhone(req.clientPhone);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function getMe(req, res, next) {
  try {
    const data = await customerService.getByPhone(req.clientPhone);
    res.json({
      phone: data.phone,
      customer: data.customer
        ? {
            id: data.customer.id,
            fullName: data.customer.full_name,
            cpf: data.customer.cpf,
            email: data.customer.email,
          }
        : null,
      address: data.address
        ? {
            id: data.address.id,
            street: data.address.street,
            number: data.address.number,
            neighborhood: data.address.neighborhood,
            zipCode: data.address.zip_code,
            complement: data.address.complement,
            reference: data.address.reference_note,
            latitude: data.address.latitude != null ? Number(data.address.latitude) : null,
            longitude: data.address.longitude != null ? Number(data.address.longitude) : null,
          }
        : null,
      profileComplete: data.complete,
      missing: data.missing,
    });
  } catch (e) {
    next(e);
  }
}

export async function createMe(req, res, next) {
  try {
    const { customer, address } = await customerService.createCustomerForVerifiedPhone(
      req.clientPhone,
      req.body
    );
    res.status(201).json({
      customer: {
        id: customer.id,
        phone: customer.phone,
        fullName: customer.full_name,
        cpf: customer.cpf,
        email: customer.email,
      },
      address: {
        id: address.id,
        street: address.street,
        number: address.number,
        neighborhood: address.neighborhood,
        zipCode: address.zip_code,
        complement: address.complement,
        reference: address.reference_note,
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function updateMe(req, res, next) {
  try {
    const customer = await repo.findByPhone(req.clientPhone);
    if (!customer) throw new AppError(404, 'Cliente não encontrado');
    const c = await customerService.updateCustomer(customer.id, req.body);
    res.json({
      id: c.id,
      phone: c.phone,
      fullName: c.full_name,
      cpf: c.cpf,
      email: c.email,
    });
  } catch (e) {
    next(e);
  }
}

export async function postAddressMe(req, res, next) {
  try {
    const customer = await repo.findByPhone(req.clientPhone);
    if (!customer) throw new AppError(404, 'Cliente não encontrado');
    const addr = await customerService.addAddress(customer.id, {
      street: req.body.street,
      number: req.body.number,
      neighborhood: req.body.neighborhood,
      zipCode: req.body.zipCode,
      complement: req.body.complement,
      reference: req.body.reference,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });
    res.status(201).json({
      id: addr.id,
      street: addr.street,
      number: addr.number,
      neighborhood: addr.neighborhood,
      zipCode: addr.zip_code,
      complement: addr.complement,
      reference: addr.reference_note,
      latitude: addr.latitude != null ? Number(addr.latitude) : null,
      longitude: addr.longitude != null ? Number(addr.longitude) : null,
    });
  } catch (e) {
    next(e);
  }
}

export async function validateCoupon(req, res, next) {
  try {
    const slug = String(req.body?.storeSlug || 'principal').trim();
    const store = await storeRepo.findStoreBySlug(slug);
    if (!store) throw new AppError(404, 'Loja não encontrada');
    const data = await customerService.getByPhone(req.clientPhone);
    if (!data.customer?.id) {
      throw new AppError(400, 'Complete o cadastro antes de usar cupom');
    }
    const subtotal = Number(req.body?.subtotal);
    const deliveryFee = Number(req.body?.deliveryFee ?? req.body?.delivery_fee ?? 0);
    if (!req.body?.code || !String(req.body.code).trim()) {
      throw new AppError(400, 'Informe o código do cupom');
    }
    const r = await couponService.validateCouponForCustomer({
      storeId: store.id,
      customerId: data.customer.id,
      code: req.body.code,
      orderSubtotal: subtotal,
      deliveryFee,
    });
    res.json({ discountAmount: r.discountAmount, couponId: r.couponId });
  } catch (e) {
    next(e);
  }
}

export async function putAddressMe(req, res, next) {
  try {
    const addressId = Number(req.params.id);
    const customer = await repo.findByPhone(req.clientPhone);
    if (!customer) throw new AppError(404, 'Cliente não encontrado');
    const owned = await repo.findAddressForCustomer(addressId, customer.id);
    if (!owned) throw new AppError(404, 'Endereço não encontrado');
    const addr = await customerService.updateAddress(addressId, customer.id, {
      street: req.body.street,
      number: req.body.number,
      neighborhood: req.body.neighborhood,
      zipCode: req.body.zipCode,
      complement: req.body.complement,
      reference: req.body.reference,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });
    res.json({
      id: addr.id,
      street: addr.street,
      number: addr.number,
      neighborhood: addr.neighborhood,
      zipCode: addr.zip_code,
      complement: addr.complement,
      reference: addr.reference_note,
      latitude: addr.latitude != null ? Number(addr.latitude) : null,
      longitude: addr.longitude != null ? Number(addr.longitude) : null,
    });
  } catch (e) {
    next(e);
  }
}
