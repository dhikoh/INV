import { describe, it, expect } from 'vitest';
import {
  createBusiness,
  createUser,
  createCustomer,
  createProduct,
  createDraftOrder,
  ctxFor,
} from '../factories';
import { Role } from '@prisma/client';

describe('Test Infrastructure: factories.ts (T0.5)', () => {
  it('menghasilkan entitas bisnis dan user terstruktur', () => {
    const biz = createBusiness();
    expect(biz.code).toBe('TRB');

    const sales = createUser(Role.SALES, { businessId: biz.id });
    expect(sales.role).toBe(Role.SALES);
    expect(sales.businessId).toBe(biz.id);

    const ctx = ctxFor(sales, biz.id);
    expect(ctx.user.id).toBe(sales.id);
    expect(ctx.businessId).toBe(biz.id);
    expect(ctx.role).toBe(Role.SALES);
  });

  it('menghasilkan produk dan order draft dengan default yang valid', () => {
    const biz = createBusiness();
    const cust = createCustomer(biz.id);
    const prod = createProduct(biz.id);
    const order = createDraftOrder(biz.id, cust.id, 'user_1');

    expect(cust.businessId).toBe(biz.id);
    expect(prod.minPrice).toBeLessThanOrEqual(prod.basePrice);
    expect(order.status).toBe('DRAFT');
  });
});
