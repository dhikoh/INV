import { withApi } from '@/lib/api/withApi';
import { revokeSession } from '@/lib/auth/session';

export const POST = withApi(
  {
    roles: ['SUPERADMIN', 'SALES'],
    allowPasswordChange: true,
  },
  async ({ ctx }) => {
    await revokeSession(ctx.sessionId);
    return {
      data: {
        message: 'Berhasil logout',
      },
      clearSessionCookie: true,
    };
  }
);
