import { NextRequest, NextResponse } from 'next/server';
import { getQualityProfiles as getSonarrProfiles, updateQualityProfile as updateSonarrProfile } from '@/lib/api/sonarr';
import { getQualityProfiles as getRadarrProfiles, updateQualityProfile as updateRadarrProfile } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const profileId = parseInt(id, 10);

  if (isNaN(profileId) || profileId < 1) {
    return NextResponse.json({ error: 'Invalid profile ID' }, { status: 400 });
  }

  try {
    const { service, upgradeAllowed } = await request.json();

    if (service !== 'sonarr' && service !== 'radarr') {
      return NextResponse.json({ error: 'Invalid service' }, { status: 400 });
    }

    // Fetch the full profile, modify upgradeAllowed, PUT it back
    const profiles = service === 'sonarr'
      ? await getSonarrProfiles()
      : await getRadarrProfiles();

    const profile = profiles.find(p => p.id === profileId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const updated = { ...profile, upgradeAllowed };

    if (service === 'sonarr') {
      await updateSonarrProfile(updated);
    } else {
      await updateRadarrProfile(updated);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update profile', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
