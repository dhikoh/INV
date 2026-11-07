import { applyBps, assertInt, DomainError, Rupiah } from './money';

export interface LineInput {
  qty: number;
  unitPrice: Rupiah;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: number; // bps bila PERCENT, Rupiah TOTAL BARIS bila AMOUNT
}

export interface LineResult {
  lineSubtotal: Rupiah;
  lineDiscount: Rupiah;
  lineNet: Rupiah;
}

export function calcLine(i: LineInput): LineResult {
  assertInt(i.qty, 'qty');
  assertInt(i.unitPrice, 'unitPrice');
  if (i.qty <= 0)
    throw new DomainError('QTY_INVALID', 'Jumlah harus lebih dari 0');
  if (i.unitPrice < 0)
    throw new DomainError('PRICE_INVALID', 'Harga tidak boleh negatif');
  const lineSubtotal = assertInt(i.unitPrice * i.qty, 'lineSubtotal');
  let lineDiscount = 0;
  if (i.discountType === 'PERCENT') {
    if (i.discountValue < 0 || i.discountValue > 10000) {
      throw new DomainError('DISCOUNT_INVALID', 'Persen diskon 0-100');
    }
    lineDiscount = applyBps(lineSubtotal, i.discountValue);
  } else if (i.discountType === 'AMOUNT') {
    if (i.discountValue < 0) {
      throw new DomainError('DISCOUNT_INVALID', 'Diskon tidak boleh negatif');
    }
    lineDiscount = assertInt(i.discountValue, 'discountValue');
  }
  if (lineDiscount > lineSubtotal) {
    throw new DomainError(
      'DISCOUNT_EXCEEDS_LINE',
      'Diskon melebihi nilai baris'
    );
  }
  return { lineSubtotal, lineDiscount, lineNet: lineSubtotal - lineDiscount };
}

export interface OrderTotalsInput {
  lines: LineResult[];
  shippingCharge: Rupiah; // yang ditagihkan ke customer, boleh 0
  ppnEnabled: boolean;
  ppnRateBps: number;
  dpBps: number; // 0 = tanpa DP
}

export function calcOrderTotals(i: OrderTotalsInput) {
  if (i.lines.length === 0) {
    throw new DomainError(
      'ORDER_EMPTY',
      'Order harus punya minimal satu baris'
    );
  }
  if (i.shippingCharge < 0) {
    throw new DomainError('SHIPPING_INVALID', 'Ongkir tidak boleh negatif');
  }
  if (i.dpBps < 0 || i.dpBps > 9900) {
    throw new DomainError('DP_INVALID', 'DP harus 0 sampai 99 persen');
  }
  const subtotal = i.lines.reduce((s, l) => s + l.lineSubtotal, 0);
  const discountTotal = i.lines.reduce((s, l) => s + l.lineDiscount, 0);
  const goodsNet = subtotal - discountTotal;
  const taxBase = goodsNet + i.shippingCharge; // PPN dikenakan atas barang bersih + ongkir yang ditagihkan
  const ppnAmount = i.ppnEnabled ? applyBps(taxBase, i.ppnRateBps) : 0;
  const grandTotal = taxBase + ppnAmount;
  const dpAmount = i.dpBps > 0 ? applyBps(grandTotal, i.dpBps) : 0;
  return {
    subtotal,
    discountTotal,
    goodsNet,
    shippingCharge: i.shippingCharge,
    ppnAmount,
    grandTotal,
    dpAmount,
  };
}
