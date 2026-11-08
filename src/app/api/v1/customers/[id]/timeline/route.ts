import { Role, OrderStatus, InteractionType } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';

export interface TimelineInteraction {
  type: InteractionType;
  summary: string;
  occurredAt: string;
  nextFollowUpAt: string | null;
  sales: { id: string; name: string; username: string } | null;
  createdAt: string;
}

export interface TimelineOrder {
  orderNo: string | null;
  status: OrderStatus;
  grandTotal: number;
  orderDate: string;
  sales: { id: string; name: string; username: string } | null;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  kind: 'INTERACTION' | 'ORDER';
  timestamp: string; // ISO string
  interaction?: TimelineInteraction;
  order?: TimelineOrder;
}

// GET /api/v1/customers/:id/timeline - Linimasa kronologis interaksi CRM dan order pelanggan
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Verifikasi pelanggan ada dan masuk scope hak akses
    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // 2. Ambil seluruh interaksi CRM untuk pelanggan ini
    const interactions = await prisma.crmInteraction.findMany({
      where: {
        businessId,
        customerId: customer.id,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    // 3. Ambil seluruh order pelanggan ini (hanya yang belum dihapus lunak)
    const orders = await prisma.order.findMany({
      where: {
        businessId,
        customerId: customer.id,
        deletedAt: null,
      },
      select: {
        id: true,
        orderNo: true,
        orderDate: true,
        status: true,
        grandTotal: true,
        salesId: true,
        createdAt: true,
      },
      orderBy: {
        orderDate: 'desc',
      },
    });

    // 4. Kumpulkan seluruh salesId unik untuk mengambil nama sales
    const salesIds = Array.from(
      new Set([
        ...interactions.map((i) => i.salesId),
        ...orders.map((o) => o.salesId),
      ])
    );

    const users =
      salesIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: { in: salesIds },
            },
            select: {
              id: true,
              name: true,
              username: true,
            },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    // 5. Gabungkan menjadi linimasa kronologis
    const timeline: TimelineItem[] = [];

    for (const item of interactions) {
      timeline.push({
        id: `interaction-${item.id}`,
        kind: 'INTERACTION',
        timestamp: item.occurredAt.toISOString(),
        interaction: {
          type: item.type,
          summary: item.summary,
          occurredAt: item.occurredAt.toISOString(),
          nextFollowUpAt: item.nextFollowUpAt
            ? item.nextFollowUpAt.toISOString()
            : null,
          sales: userMap.get(item.salesId) || null,
          createdAt: item.createdAt.toISOString(),
        },
      });
    }

    for (const item of orders) {
      timeline.push({
        id: `order-${item.id}`,
        kind: 'ORDER',
        timestamp: item.orderDate.toISOString(),
        order: {
          orderNo: item.orderNo,
          status: item.status,
          grandTotal: fromDb(item.grandTotal),
          orderDate: item.orderDate.toISOString(),
          sales: userMap.get(item.salesId) || null,
          createdAt: item.createdAt.toISOString(),
        },
      });
    }

    // Urutkan linimasa secara menurun (terbaru di atas)
    timeline.sort((a, b) => {
      const timeDiff =
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    return {
      data: {
        customer,
        timeline,
      },
    };
  }
);
