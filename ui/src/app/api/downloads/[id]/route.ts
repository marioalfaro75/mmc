import { NextRequest, NextResponse } from 'next/server';
import { deleteTorrent } from '@/lib/api/qbittorrent';
import { deleteItem as deleteUsenet } from '@/lib/api/sabnzbd';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (id.startsWith('torrent-')) {
      const hash = id.replace('torrent-', '');
      await deleteTorrent(hash, false);
    } else if (id.startsWith('usenet-')) {
      const nzoId = id.replace('usenet-', '');
      await deleteUsenet(nzoId);
    } else {
      return NextResponse.json(
        { error: 'Unknown download source', service: 'downloads', statusCode: 400 },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete download', service: 'downloads', statusCode: 500 },
      { status: 500 }
    );
  }
}
