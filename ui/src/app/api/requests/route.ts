import { NextRequest, NextResponse } from 'next/server';
import { getRequests, createRequest } from '@/lib/api/seerr';

export async function GET() {
  try {
    const data = await getRequests();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch requests', service: 'seerr', statusCode: 500 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createRequest(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create request', service: 'seerr', statusCode: 500 },
      { status: 500 }
    );
  }
}
