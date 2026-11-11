import { Role } from '@prisma/client';
import { prisma } from '../db';
import {
  normalizeIndonesianPhone,
  cleanStoreName,
  extractCityFromRecord,
  areCitiesMatching,
} from '../domain/phone';
import { createNotification } from './notification';
import type { TxClient } from './invoice';

export const TAG_PENDING_VERIFIKASI_ADMIN = 'PENDING_VERIFIKASI_ADMIN';

export type CollisionReason = 'PHONE_MATCH' | 'NAME_AND_CITY_MATCH';

export interface CustomerCollisionInput {
  businessId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  shippingAddress?: string | null;
  billingAddress?: string | null;
  excludeCustomerId?: string;
}

export interface CustomerCollisionCheckResult {
  hasCollision: boolean;
  reason?: CollisionReason;
  reasonDescription?: string;
  matchedCustomer?: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    city: string | null;
    assignedSalesId: string | null;
    assignedSalesName?: string | null;
  };
}

/**
 * Memeriksa potensi tabrakan calon pelanggan baru antar sales:
 * Pintu 1: Nomor Telepon Sama (setelah normalisasi +62 / 08).
 * Pintu 2: Nama Toko Sama DAN Wilayah Kota Sama (meskipun nomor telepon berbeda).
 *
 * Skenario Lolos: Nama Toko sama tetapi wilayah kota berbeda (dan nomor telepon berbeda)
 * langsung dianggap sah (LOLOS OTOMATIS) sebagai entitas bisnis yang berbeda.
 */
export async function checkCustomerCollision(
  tx: TxClient | typeof prisma,
  input: CustomerCollisionInput
): Promise<CustomerCollisionCheckResult> {
  const { businessId, name, phone, excludeCustomerId } = input;

  const existingCustomers = await tx.customer.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      address: true,
      shippingAddress: true,
      billingAddress: true,
      assignedSalesId: true,
      assignedSales: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });

  const normInputPhone = normalizeIndonesianPhone(phone);
  const cleanInputName = cleanStoreName(name);
  const inputCity = extractCityFromRecord(input);

  // 1. PINTU 1: Pemeriksaan Kesamaan Nomor Telepon (Setelah Normalisasi)
  if (normInputPhone) {
    for (const ec of existingCustomers) {
      const normExistPhone = normalizeIndonesianPhone(ec.phone);
      if (normExistPhone && normExistPhone === normInputPhone) {
        const salesName = ec.assignedSales?.name ?? 'Super Admin / Belum Ditugaskan';
        const existCity = (extractCityFromRecord(ec) ?? 'Tidak spesifik').toUpperCase();

        return {
          hasCollision: true,
          reason: 'PHONE_MATCH',
          reasonDescription: `Nomor kontak (${phone}) terdeteksi sama dengan nomor ${ec.phone} milik pelanggan terdaftar [${ec.code}] "${ec.name}" (Kota: ${existCity}) yang dibina oleh ${salesName}.`,
          matchedCustomer: {
            id: ec.id,
            code: ec.code,
            name: ec.name,
            phone: ec.phone,
            city: existCity,
            assignedSalesId: ec.assignedSalesId,
            assignedSalesName: salesName,
          },
        };
      }
    }
  }

  // 2. PINTU 2: Pemeriksaan Nama Toko Sama DAN Wilayah Kota Sama
  if (cleanInputName && cleanInputName.length >= 2) {
    for (const ec of existingCustomers) {
      const cleanExistName = cleanStoreName(ec.name);

      // Cek kemiripan nama (persis sama atau salah satu memuat nama inti)
      const isNameMatching =
        cleanExistName === cleanInputName ||
        (cleanInputName.length >= 4 && cleanExistName.includes(cleanInputName)) ||
        (cleanExistName.length >= 4 && cleanInputName.includes(cleanExistName));

      if (isNameMatching) {
        // WAJIB dicek apakah wilayah kotanya sama
        const citiesMatch = areCitiesMatching(input, ec);

        if (citiesMatch) {
          const salesName = ec.assignedSales?.name ?? 'Super Admin / Belum Ditugaskan';
          const matchedCity = (inputCity ?? extractCityFromRecord(ec) ?? 'Sama').toUpperCase();

          return {
            hasCollision: true,
            reason: 'NAME_AND_CITY_MATCH',
            reasonDescription: `Nama toko mirip ("${name}") dan berada di wilayah kota yang sama (${matchedCity}) dengan pelanggan [${ec.code}] "${ec.name}" binaan ${salesName}.`,
            matchedCustomer: {
              id: ec.id,
              code: ec.code,
              name: ec.name,
              phone: ec.phone,
              city: matchedCity,
              assignedSalesId: ec.assignedSalesId,
              assignedSalesName: salesName,
            },
          };
        }
        // Bila nama sama tetapi kotanya terbukti beda -> TIDAK ditandai tabrakan (Lolos Otomatis).
      }
    }
  }

  return { hasCollision: false };
}

/**
 * Mengirim notifikasi ke seluruh Super Admin jika ada pengajuan toko baru oleh sales
 * yang terdeteksi bertabrakan / terindikasi duplikasi.
 */
export async function notifySuperAdminsCollision(
  tx: TxClient,
  opts: {
    businessId: string;
    customer: { id: string; code: string; name: string; phone?: string | null };
    creatorSales: { id: string; name: string; username?: string };
    collision: CustomerCollisionCheckResult;
  }
) {
  const { businessId, customer, creatorSales, collision } = opts;

  const superAdmins = await tx.user.findMany({
    where: {
      role: Role.SUPERADMIN,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  const matched = collision.matchedCustomer;
  const reasonText =
    collision.reason === 'PHONE_MATCH'
      ? `Nomor telepon sama dengan toko [${matched?.code}] ${matched?.name}`
      : `Nama toko & wilayah kota sama dengan [${matched?.code}] ${matched?.name}`;

  for (const sa of superAdmins) {
    await createNotification(tx, {
      businessId,
      userId: sa.id,
      type: 'CUSTOMER_COLLISION',
      title: 'Peringatan Verifikasi Toko Baru (Tabrakan Leads)',
      body: `Sales ${creatorSales.name} mengajukan toko [${customer.code}] ${customer.name}. ${reasonText} (binaan ${matched?.assignedSalesName}). Diperlukan verifikasi Owner.`,
      linkPath: `/customers?q=${encodeURIComponent(customer.code)}`,
      dedupeKey: `collision-cust-${customer.id}-${sa.id}`,
    });
  }
}
