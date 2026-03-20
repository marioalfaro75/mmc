import { NextRequest, NextResponse } from 'next/server';
import { sanitizeError } from '@/lib/security';
import { deleteTorrent, pauseTorrent, resumeTorrent, forceStartTorrent } from '@/lib/api/qbittorrent';
import { deleteItem as deleteUsenet, pauseItem as pauseUsenet, resumeItem as resumeUsenet } from '@/lib/api/sabnzbd';

type Action = 'pause' | 'resume' | 'forceStart';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { action } = (await request.json()) as { action: Action };
    const id = params.id;

    if (id.startsWith('torrent-')) {
      const hash = id.replace('torrent-', '');
      switch (action) {
        case 'pause': await pauseTorrent(hash); break;
        case 'resume': await resumeTorrent(hash); break;
        case 'forceStart': await forceStartTorrent(hash); break;
        default:
          return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    } else if (id.startsWith('usenet-')) {
      const nzoId = id.replace('usenet-', '');
      switch (action) {
        case 'pause': await pauseUsenet(nzoId); break;
        case 'resume':
        case 'forceStart': await resumeUsenet(nzoId); break;
        default:
          return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unknown download source' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update download: ${sanitizeError(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const deleteFiles = request.nextUrl.searchParams.get('deleteFiles') === 'true';

    if (id.startsWith('torrent-')) {
      const hash = id.replace('torrent-', '');
      await deleteTorrent(hash, deleteFiles);
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
