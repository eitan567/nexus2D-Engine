import {NextResponse} from 'next/server';
import {getAiHealthPayload} from '../../../server/vertex-ai-middleware';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getAiHealthPayload());
}
