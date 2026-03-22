import { NextRequest, NextResponse } from 'next/server';
import { deleteQueueItem as deleteSonarrQueueItem, runCommand as sonarrCommand } from '@/lib/api/sonarr';
import { deleteQueueItem as deleteRadarrQueueItem, runCommand as radarrCommand } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const queueId = parseInt(id, 10);

  if (isNaN(queueId) || queueId < 1) {
    return NextResponse.json({ error: 'Invalid queue ID' }, { status: 400 });
  }

  const searchAfter = request.nextUrl.searchParams.get('searchAfter') === 'true';

  try {
    const { service, mediaId, episodeId } = await request.json();

    if (service === 'sonarr') {
      await deleteSonarrQueueItem(queueId);
      if (searchAfter && episodeId) {
        await sonarrCommand({ name: 'EpisodeSearch', episodeIds: [episodeId] });
      }
    } else if (service === 'radarr') {
      await deleteRadarrQueueItem(queueId);
      if (searchAfter && mediaId) {
        await radarrCommand({ name: 'MoviesSearch', movieIds: [mediaId] });
      }
    } else {
      return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to blocklist item', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
