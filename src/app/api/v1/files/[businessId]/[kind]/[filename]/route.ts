import { NextRequest, NextResponse } from 'next/server';
import { serveFile } from '@/lib/files/fileService';
import { toErrorResponse } from '@/lib/api/withApi';

export async function GET(
  req: NextRequest,
  route: {
    params: Promise<{
      businessId: string;
      kind: string;
      filename: string;
    }>;
  }
): Promise<NextResponse> {
  try {
    const params = await route.params;
    return await serveFile(req, params);
  } catch (err) {
    return toErrorResponse(err);
  }
}
