import { prisma } from '@/lib/db';
import { suggestInterval, daysUntil, wibDayIndex } from '@/lib/domain/reminder';
import {
  Prisma,
  OrderStatus,
  ReminderStatus,
  ReminderSource,
  InvoiceStatus,
  Role,
  PaymentStatus,
} from '@prisma/client';
import { createNotification } from './notification';
import type { TxClient } from './invoice';

export function formatWibDate(date: Date): string {
  const wibTime = new Date(date.getTime() + 7 * 3_600_000);
  return wibTime.toISOString().slice(0, 10);
}

/**
 * Memperbarui atau membuat pengingat repeat order saat sebuah pesanan selesai (COMPLETED).
 * Rujukan: Seksi 13.1 Dokumen Spesifikasi.
 */
export async function updateRemindersForCompletedOrder(
  tx: TxClient,
  orderId: string,
  businessId?: string
): Promise<void> {
  if (!tx?.reminder) {
    return;
  }

  const orderWhere: Prisma.OrderWhereInput = businessId
    ? { id: orderId, businessId }
    : { id: orderId };
  const order =
    typeof tx.order?.findFirst === 'function'
      ? await tx.order.findFirst({
        where: orderWhere,
        include: {
          items: true,
          business: true,
        },
      })
      : null;

  if (!order || order.status !== OrderStatus.COMPLETED || !order.items) {
    return;
  }

  const bizId = businessId || order.businessId;

  const shipment =
    typeof tx?.shipment?.findFirst === 'function'
      ? await tx.shipment.findFirst({
        where: { orderId, businessId: bizId },
        orderBy: { shippedAt: 'desc' },
      })
      : null;
  const shipDate = shipment?.shippedAt || order.updatedAt || new Date();
  const fallbackDays =
    order.repeatIntervalDays || order.business?.defaultRepeatDays || 30;

  // Kumpulkan semua productId unik dari baris produk pesanan
  const productIds = [
    ...new Set(
      order.items
        .map((i: { productId?: string | null }) => i.productId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  for (const productId of productIds) {
    // 1. Kumpulkan tanggal pengiriman semua order COMPLETED (bukan CANCELLED) customer untuk produk ini
    const completedOrders =
      typeof tx.order?.findMany === 'function'
        ? await tx.order.findMany({
          where: {
            businessId: bizId,
            customerId: order.customerId,
            status: OrderStatus.COMPLETED,
            deletedAt: null,
            items: {
              some: { productId },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
        : [];

    const completedOrderIds = completedOrders.map((o) => o.id);
    const shipments =
      typeof tx?.shipment?.findMany === 'function' && completedOrderIds.length > 0
        ? await tx.shipment.findMany({
          where: { orderId: { in: completedOrderIds }, businessId: bizId },
        })
        : [];
    const shipmentMap = new Map<string, { orderId: string; shippedAt: Date | null }>();
    for (const s of shipments as Array<{ orderId: string; shippedAt: Date | null }>) {
      const prev = shipmentMap.get(s.orderId);
      if (!prev || (s.shippedAt && (!prev.shippedAt || s.shippedAt > prev.shippedAt))) {
        shipmentMap.set(s.orderId, s);
      }
    }

    const shipDates = completedOrders.map(
      (o) => shipmentMap.get(o.id)?.shippedAt || o.updatedAt || o.createdAt
    );

    const interval = suggestInterval(shipDates, fallbackDays);
    const nextDueDate = new Date(shipDate.getTime() + interval * 86_400_000);

    // Cari pengingat yang sudah ada
    const existing = await tx.reminder.findFirst({
      where: {
        businessId: bizId,
        customerId: order.customerId,
        productId,
      },
    });

    if (!existing) {
      await tx.reminder.create({
        data: {
          businessId: bizId,
          customerId: order.customerId,
          productId,
          salesId: order.salesId,
          intervalDays: interval,
          lastOrderDate: shipDate,
          nextDueDate,
          status: ReminderStatus.ACTIVE,
          source: ReminderSource.AUTO,
        },
      });
    } else if (existing.source === ReminderSource.AUTO) {
      await tx.reminder.updateMany({
        where: { id: existing.id, businessId: bizId },
        data: {
          salesId: order.salesId,
          intervalDays: interval,
          lastOrderDate: shipDate,
          nextDueDate,
          status: ReminderStatus.ACTIVE,
          lastNotifiedAt: null,
          escalatedAt: null,
          snoozedUntil: null,
        },
      });
    } else {
      // source === MANUAL: pertahankan interval sales, hanya majukan lastOrderDate & nextDueDate
      const manualNextDueDate = new Date(
        shipDate.getTime() + existing.intervalDays * 86_400_000
      );
      await tx.reminder.updateMany({
        where: { id: existing.id, businessId: bizId },
        data: {
          salesId: order.salesId,
          lastOrderDate: shipDate,
          nextDueDate: manualNextDueDate,
          status: ReminderStatus.ACTIVE,
          lastNotifiedAt: null,
          escalatedAt: null,
          snoozedUntil: null,
        },
      });
    }
  }
}

/**
 * Membangun ulang pengingat repeat order customer jika ada order yang dibatalkan (void).
 * Rujukan: Seksi 13.1 Dokumen Spesifikasi.
 */
export async function rebuildRemindersForCustomer(
  tx: TxClient,
  customerId: string,
  businessId?: string
): Promise<void> {
  const customerWhere: Prisma.CustomerWhereInput = businessId
    ? { id: customerId, businessId }
    : { id: customerId };
  const customer =
    typeof tx.customer?.findFirst === 'function'
      ? await tx.customer.findFirst({
        where: customerWhere,
        include: { business: true },
      })
      : null;

  if (!customer) return;

  const bizId = businessId || customer.businessId;

  const existingReminders = await tx.reminder.findMany({
    where: { customerId, businessId: bizId },
  });

  const completedOrders = await tx.order.findMany({
    where: {
      businessId: bizId,
      customerId,
      status: OrderStatus.COMPLETED,
      deletedAt: null,
    },
    include: {
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const orderIds = completedOrders.map((o) => o.id);
  const shipments =
    typeof tx?.shipment?.findMany === 'function' && orderIds.length > 0
      ? await tx.shipment.findMany({
        where: { orderId: { in: orderIds }, businessId: bizId },
      })
      : [];
  const shipmentMap = new Map(
    shipments.map((s: { orderId: string; shippedAt: Date | null }) => [s.orderId, s])
  );

  const productOrdersMap = new Map<string, typeof completedOrders>();
  for (const o of completedOrders) {
    if (o.items) {
      for (const item of o.items) {
        if (item.productId) {
          const list = productOrdersMap.get(item.productId) || [];
          list.push(o);
          productOrdersMap.set(item.productId, list);
        }
      }
    }
  }

  const fallbackDays = customer.business?.defaultRepeatDays || 30;

  for (const reminder of existingReminders) {
    if (!reminder.productId || !productOrdersMap.has(reminder.productId)) {
      // Pengingat tanpa order tersisa menjadi CANCELLED
      await tx.reminder.updateMany({
        where: { id: reminder.id, businessId },
        data: { status: ReminderStatus.CANCELLED },
      });
    } else {
      const orders = productOrdersMap.get(reminder.productId)!;
      const lastOrder = orders[orders.length - 1];
      const lastShipDate =
        shipmentMap.get(lastOrder.id)?.shippedAt || lastOrder.updatedAt || lastOrder.createdAt;

      const shipDates = orders.map(
        (o) => shipmentMap.get(o.id)?.shippedAt || o.updatedAt || o.createdAt
      );

      const interval =
        reminder.source === ReminderSource.MANUAL
          ? reminder.intervalDays
          : suggestInterval(shipDates, fallbackDays);

      const nextDueDate = new Date(lastShipDate.getTime() + interval * 86_400_000);

      await tx.reminder.updateMany({
        where: { id: reminder.id, businessId },
        data: {
          intervalDays: interval,
          lastOrderDate: lastShipDate,
          nextDueDate,
          status: ReminderStatus.ACTIVE,
        },
      });
    }
  }
}

/**
 * 1. Job reminders.repeat.scan (Seksi 13.2)
 *
 * Memindai pengingat repeat order aktif:
 * - H-3, H-0, dan terlambat (setiap hari) mengirim notifikasi ke sales penanggung jawab.
 * - Terlambat >= 3 hari eskalasi ke Super Admin (sekali).
 * - Dilewati bila customer sudah membuat order baru untuk produk tersebut setelah lastOrderDate.
 */
export async function scanRepeatReminders(
  now: Date = new Date(),
  client: TxClient = prisma
): Promise<{ scanned: number; notified: number; escalated: number }> {
  const wibDateStr = formatWibDate(now);
  const businesses =
    typeof client?.business?.findMany === 'function'
      ? await client.business.findMany({ select: { id: true } })
      : [{ id: '' }];

  let scanned = 0;
  let notified = 0;
  let escalated = 0;

  for (const b of businesses) {
    const whereClause: Prisma.ReminderWhereInput = {
      status: ReminderStatus.ACTIVE,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      ...(b.id ? { businessId: b.id } : {}),
    };

    const reminders = await client.reminder.findMany({
      where: whereClause,
      include: {
        customer: true,
      },
    });

    scanned += reminders.length;

    for (const reminder of reminders) {
      try {
        // Cek apakah ada order lain customer itu untuk produk yang sama (status bukan CANCELLED)
        // dibuat setelah lastOrderDate
        if (reminder.productId) {
          const newerWhere: Prisma.OrderWhereInput = {
            customerId: reminder.customerId,
            createdAt: { gt: reminder.lastOrderDate },
            status: { not: OrderStatus.CANCELLED },
            deletedAt: null,
            items: {
              some: { productId: reminder.productId },
            },
            ...(reminder.businessId ? { businessId: reminder.businessId } : {}),
          };

          const newerOrder = await client.order.findFirst({
            where: newerWhere,
          });

          if (newerOrder) {
            continue; // Lewati notifikasi karena pelanggan sudah memesan
          }
        }

        const diff = daysUntil(reminder.nextDueDate, now);

        // Ambil nama produk jika ada
        let productInfo = 'produk terkait';
        if (reminder.productId) {
          const prod =
            typeof client?.product?.findFirst === 'function'
              ? await client.product.findFirst({
                where: { id: reminder.productId, businessId: reminder.businessId },
                select: { name: true, sku: true },
              })
              : null;
          if (prod) {
            productInfo = `${prod.name} (${prod.sku})`;
          }
        }

        // Notifikasi ke Sales: H-3, H-0, atau terlambat (diff < 0)
        if (diff === 3 || diff === 0 || diff < 0) {
          const dedupeKey = `REPEAT_DUE:${reminder.id}:${wibDateStr}`;
          const title = `Pengingat Repeat Order: ${reminder.customer.name}`;
          let body = '';

          if (diff === 3) {
            body = `Perkiraan repeat order pelanggan ${reminder.customer.name} dalam 3 hari (H-3).\nProduk: ${productInfo}.\nSilakan hubungi pelanggan untuk konfirmasi pemesanan kembali.`;
          } else if (diff === 0) {
            body = `Hari ini adalah jadwal perkiraan repeat order pelanggan ${reminder.customer.name} (H-0).\nProduk: ${productInfo}.\nSegera hubungi pelanggan sekarang.`;
          } else {
            body = `Jadwal repeat order pelanggan ${reminder.customer.name} terlambat ${Math.abs(diff)} hari.\nProduk: ${productInfo}.\nSegera tindak lanjuti agar pelanggan tidak beralih.`;
          }

          await createNotification(client, {
            businessId: reminder.businessId,
            userId: reminder.salesId,
            type: 'REPEAT_DUE',
            title,
            body,
            linkPath: `/customers/${reminder.customerId}`,
            dedupeKey,
          });

          await client.reminder.updateMany({
            where: { id: reminder.id, businessId: reminder.businessId },
            data: { lastNotifiedAt: now },
          });

          notified++;
        }

        // Eskalasi ke Super Admin jika terlambat 3 hari atau lebih (diff <= -3) dan belum pernah dieskalasikan
        if (diff <= -3 && !reminder.escalatedAt) {
          const superAdmins = await client.user.findMany({
            where: {
              businessId: reminder.businessId,
              role: Role.SUPERADMIN,
              isActive: true,
              deletedAt: null,
            },
          });

          const sales =
            typeof client?.user?.findUnique === 'function'
              ? await client.user.findUnique({
                where: { id: reminder.salesId },
                select: { name: true },
              })
              : typeof client?.user?.findFirst === 'function'
                ? await client.user.findFirst({
                  where: { id: reminder.salesId },
                  select: { name: true },
                })
                : null;

          for (const admin of superAdmins) {
            const dedupeKey = `REPEAT_ESCALATION:${reminder.id}:${admin.id}`;
            await createNotification(client, {
              businessId: reminder.businessId,
              userId: admin.id,
              type: 'REPEAT_ESCALATION',
              title: `⚠️ Eskalasi Repeat Order Terlambat: ${reminder.customer.name}`,
              body: `Pelanggan ${reminder.customer.name} terlambat repeat order ${Math.abs(diff)} hari.\nProduk: ${productInfo}.\nSales penanggung jawab: ${sales?.name || 'Sales'}.\nBelum ada pesanan baru tercatat.`,
              linkPath: `/customers/${reminder.customerId}`,
              dedupeKey,
            });
          }

          await client.reminder.updateMany({
            where: { id: reminder.id, businessId: reminder.businessId },
            data: { escalatedAt: now },
          });

          escalated++;
        }
      } catch {
        // Isolasi kegagalan per item agar tidak menghentikan pemrosesan pengingat lainnya
      }
    }
  }

  return { scanned, notified, escalated };
}

/**
 * 2. Job invoices.due.scan (Seksi 13.2)
 *
 * - H-3 dan H-0 notifikasi jatuh tempo faktur ke sales pemilik order.
 * - Terlambat: setiap 2 hari (hari terlambat genap) notifikasi ke sales.
 * - Hari Senin 08:00 WIB: ringkasan piutang terlambat ke Super Admin.
 */
export async function scanInvoicesDue(
  now: Date = new Date(),
  client: TxClient = prisma
): Promise<{ scanned: number; notified: number }> {
  const wibDateStr = formatWibDate(now);
  const businesses =
    typeof client?.business?.findMany === 'function'
      ? await client.business.findMany({ select: { id: true, name: true } })
      : [{ id: '', name: 'Default' }];

  let totalScanned = 0;
  let notified = 0;

  for (const b of businesses) {
    const invWhere: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.APPROVED,
      deletedAt: null,
      ...(b.id ? { businessId: b.id } : {}),
    };

    const invoices = await client.invoice.findMany({
      where: invWhere,
    });

    totalScanned += invoices.length;

    const unpaidInvoices = invoices.filter(
      (inv) => inv.paidAmount < inv.amount && inv.dueDate
    );

    const orderIds = Array.from(new Set(unpaidInvoices.map((i) => i.orderId)));
    const ordWhere: Prisma.OrderWhereInput = {
      id: { in: orderIds },
      status: { not: OrderStatus.CANCELLED },
      deletedAt: null,
      ...(b.id ? { businessId: b.id } : {}),
    };

    const orders =
      orderIds.length > 0
        ? await client.order.findMany({
          where: ordWhere,
          include: { customer: true },
        })
        : [];
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    for (const inv of unpaidInvoices) {
      try {
        if (!inv.dueDate) {
          continue;
        }

        const ord = orderMap.get(inv.orderId);
        if (!ord) {
          continue;
        }

        const diff = daysUntil(inv.dueDate, now);
        const remainingAmount = inv.amount - inv.paidAmount;
        const formattedAmount = `Rp ${Number(remainingAmount).toLocaleString('id-ID')}`;
        const customerName = ord.customer.name;
        const invNumber = inv.number || inv.id;

        if (diff === 3 || diff === 0) {
          const tag = diff === 3 ? 'H-3' : 'H-0';
          const dedupeKey = `INVOICE_DUE:${inv.id}:${tag}:${wibDateStr}`;
          const title = `Pengingat Jatuh Tempo Faktur #${invNumber}`;
          const body = `Faktur #${invNumber} untuk ${customerName} jatuh tempo ${diff === 3 ? '3 hari lagi (H-3)' : 'hari ini (H-0)'}.\nSisa tagihan: ${formattedAmount}.\nSilakan follow-up pembayaran ke pelanggan.`;

          await createNotification(client, {
            businessId: inv.businessId,
            userId: ord.salesId,
            type: 'INVOICE_DUE',
            title,
            body,
            linkPath: `/invoices/${inv.id}`,
            dedupeKey,
          });
          notified++;
        } else if (diff < 0) {
          const daysOverdue = Math.abs(diff);
          // Terlambat: setiap 2 hari (hari terlambat genap)
          if (daysOverdue % 2 === 0) {
            const dedupeKey = `INVOICE_OVERDUE:${inv.id}:${daysOverdue}:${wibDateStr}`;
            const title = `⚠️ Faktur Terlambat Bayar #${invNumber}`;
            const body = `Faktur #${invNumber} untuk ${customerName} telah melewati jatuh tempo selama ${daysOverdue} hari.\nSisa tagihan: ${formattedAmount}.\nSegera tagih pembayaran ke pelanggan.`;

            await createNotification(client, {
              businessId: inv.businessId,
              userId: ord.salesId,
              type: 'INVOICE_OVERDUE',
              title,
              body,
              linkPath: `/invoices/${inv.id}`,
              dedupeKey,
            });
            notified++;
          }
        }
      } catch {
        // Abaikan error per item
      }
    }

    // Senin 08:00 WIB: ringkasan piutang terlambat ke Super Admin
    const wibDayOfWeek = new Date(now.getTime() + 7 * 3_600_000).getUTCDay();
    if (wibDayOfWeek === 1 && b.id) {
      try {
        const overdueInvoices = invoices.filter(
          (i) =>
            i.paidAmount < i.amount &&
            i.dueDate &&
            daysUntil(i.dueDate, now) < 0
        );

        if (overdueInvoices.length > 0) {
          const totalOverdue = overdueInvoices.reduce(
            (acc, curr) => acc + (curr.amount - curr.paidAmount),
            0n
          );

          const superAdmins = await client.user.findMany({
            where: {
              businessId: b.id,
              role: Role.SUPERADMIN,
              isActive: true,
              deletedAt: null,
            },
          });

          for (const admin of superAdmins) {
            const dedupeKey = `AR_SUMMARY:${b.id}:${admin.id}:${wibDateStr}`;
            await createNotification(client, {
              businessId: b.id,
              userId: admin.id,
              type: 'AR_SUMMARY',
              title: `📊 Rekap Piutang Terlambat Mingguan - ${b.name}`,
              body: `Terdapat ${overdueInvoices.length} faktur yang telah melewati jatuh tempo.\nTotal piutang terlambat: Rp ${Number(totalOverdue).toLocaleString('id-ID')}.\nBuka menu Piutang untuk meninjau umur piutang.`,
              linkPath: '/receivables',
              dedupeKey,
            });
            notified++;
          }
        }
      } catch {
        // Abaikan error per usaha
      }
    }
  }

  return { scanned: totalScanned, notified };
}

/**
 * 3. Job crm.tasks.scan (Seksi 13.2)
 *
 * Mengirimkan notifikasi kepada sales yang ditugaskan untuk CrmTask yang jatuh tempo hari ini (WIB).
 */
export async function scanCrmTasks(
  now: Date = new Date(),
  client: TxClient = prisma
): Promise<{ scanned: number; notified: number }> {
  const wibDateStr = formatWibDate(now);
  const nowDayIndex = wibDayIndex(now);
  const businesses =
    typeof client?.business?.findMany === 'function'
      ? await client.business.findMany({ select: { id: true } })
      : [{ id: '' }];

  let totalScanned = 0;
  let notified = 0;

  for (const b of businesses) {
    const taskWhere: Prisma.CrmTaskWhereInput = {
      doneAt: null,
      ...(b.id ? { businessId: b.id } : {}),
    };

    const tasks = await client.crmTask.findMany({
      where: taskWhere,
      include: {
        customer: true,
      },
    });

    totalScanned += tasks.length;

    for (const task of tasks) {
      try {
        if (wibDayIndex(task.dueAt) === nowDayIndex) {
          const dedupeKey = `CRM_TASK_DUE:${task.id}:${wibDateStr}`;
          await createNotification(client, {
            businessId: task.businessId,
            userId: task.assignedToId,
            type: 'CRM_TASK_DUE',
            title: `Tugas CRM Hari Ini: ${task.title}`,
            body: `Tugas follow-up untuk ${task.customer.name} dijadwalkan hari ini:\n"${task.title}".`,
            linkPath: `/customers/${task.customerId}`,
            dedupeKey,
          });
          notified++;
        }
      } catch {
        // Abaikan error per tugas
      }
    }
  }

  return { scanned: totalScanned, notified };
}

/**
 * 4. Job owner.digest (Seksi 13.2)
 *
 * Mengirimkan ringkasan pagi operasional usaha ke Super Admin setiap hari 08:00 WIB.
 * Tidak dikirim bila semua metrik bernilai nol.
 */
export async function scanOwnerDigest(
  now: Date = new Date(),
  client: TxClient = prisma
): Promise<{ scanned: number; notified: number }> {
  const wibDateStr = formatWibDate(now);
  const businesses = await client.business.findMany();
  let notified = 0;

  for (const b of businesses) {
    try {
      const [
        pendingApprovals,
        pendingPayments,
        overdueInvoices,
        lowStockProducts,
      ] = await Promise.all([
        client.invoice.count({
          where: {
            businessId: b.id,
            status: InvoiceStatus.PENDING_APPROVAL,
            deletedAt: null,
          },
        }),
        client.payment.count({
          where: {
            businessId: b.id,
            status: PaymentStatus.PENDING_VERIFICATION,
          },
        }),
        client.invoice.findMany({
          where: {
            businessId: b.id,
            status: InvoiceStatus.APPROVED,
            deletedAt: null,
          },
        }),
        client.product.count({
          where: {
            businessId: b.id,
            deletedAt: null,
            stockQty: { lte: 0 },
          },
        }),
      ]);

      const overdueList = overdueInvoices.filter(
        (i) => i.paidAmount < i.amount && i.dueDate && daysUntil(i.dueDate, now) < 0
      );

      const totalOverdue = overdueList.reduce(
        (acc, curr) => acc + (curr.amount - curr.paidAmount),
        0n
      );

      // Tidak dikirim bila semuanya nol (Seksi 13.2)
      if (
        pendingApprovals === 0 &&
        pendingPayments === 0 &&
        overdueList.length === 0 &&
        lowStockProducts === 0
      ) {
        continue;
      }

      const superAdmins = await client.user.findMany({
        where: {
          businessId: b.id,
          role: Role.SUPERADMIN,
          isActive: true,
          deletedAt: null,
        },
      });

      for (const admin of superAdmins) {
        const dedupeKey = `OWNER_DIGEST:${b.id}:${admin.id}:${wibDateStr}`;
        const bodyLines = [
          `Ringkasan status operasional ${b.name} hari ini:`,
          `• ${pendingApprovals} pesanan/faktur menunggu persetujuan`,
          `• ${pendingPayments} pembayaran menunggu verifikasi`,
          `• ${overdueList.length} faktur piutang terlambat (total Rp ${Number(totalOverdue).toLocaleString('id-ID')})`,
          `• ${lowStockProducts} produk stok habis/kritis (≤ 0)`,
        ];

        await createNotification(client, {
          businessId: b.id,
          userId: admin.id,
          type: 'OWNER_DIGEST',
          title: `📋 Ringkasan Harian Operasional - ${b.name}`,
          body: bodyLines.join('\n'),
          linkPath: '/dashboard',
          dedupeKey,
        });
        notified++;
      }
    } catch {
      // Abaikan error per usaha
    }
  }

  return { scanned: businesses.length, notified };
}

/**
 * 5. Job housekeeping (Seksi 13.2)
 *
 * Pembersihan terjadwal setiap hari 03:00 WIB:
 * - Hapus sesi kedaluwarsa atau dicabut > 30 hari.
 * - Hapus LoginAttempt > 30 hari.
 * - Hapus TelegramLinkCode terpakai atau kedaluwarsa > 1 hari.
 */
export async function runHousekeeping(
  now: Date = new Date(),
  client: TxClient = prisma
): Promise<{
  deletedSessions: number;
  deletedLoginAttempts: number;
  deletedLinkCodes: number;
}> {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const oneDayAgo = new Date(now.getTime() - 86_400_000);

  const [sessionRes, attemptRes, linkCodeRes] = await Promise.all([
    client.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: thirtyDaysAgo } },
          { revokedAt: { lt: thirtyDaysAgo } },
        ],
      },
    }),
    client.loginAttempt.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
      },
    }),
    client.telegramLinkCode.deleteMany({
      where: {
        OR: [
          { usedAt: { lt: oneDayAgo } },
          { expiresAt: { lt: oneDayAgo } },
        ],
      },
    }),
  ]);

  return {
    deletedSessions: sessionRes.count,
    deletedLoginAttempts: attemptRes.count,
    deletedLinkCodes: linkCodeRes.count,
  };
}
