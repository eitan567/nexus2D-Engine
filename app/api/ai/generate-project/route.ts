import {NextResponse} from 'next/server';
import {formatAiRouteError, generateProjectFromPayload} from '../../../../server/vertex-ai-middleware';
import type {AIRequestPayload} from '../../../../src/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AIRequestPayload;
    const response = await generateProjectFromPayload(body);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(formatAiRouteError(error), {status: 500});
  }
}
