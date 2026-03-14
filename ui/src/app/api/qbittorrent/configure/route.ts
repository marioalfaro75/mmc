import { NextResponse } from 'next/server';
import { setPreferences, createCategory } from '@/lib/api/qbittorrent';

export async function POST() {
  const results: { step: string; status: 'ok' | 'error'; error?: string }[] = [];

  // Apply preferences in one call
  try {
    await setPreferences({
      save_path: '/data/torrents',
      current_network_interface: 'tun0',
      upnp: false,
      max_ratio_enabled: true,
      max_ratio: 1,
      max_ratio_act: 0,
    });
    results.push({ step: 'preferences', status: 'ok' });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('login failed')) {
      return NextResponse.json(
        { success: false, authError: true, error: 'qBittorrent login failed — set QBITTORRENT_PASSWORD in Settings to match your current qBittorrent password' },
        { status: 401 }
      );
    }
    results.push({ step: 'preferences', status: 'error', error: msg });
  }

  // Create categories (may fail if they already exist — that's fine)
  for (const { name, path } of [
    { name: 'radarr', path: '/data/torrents/movies' },
    { name: 'sonarr', path: '/data/torrents/tv' },
  ]) {
    try {
      await createCategory(name, path);
      results.push({ step: `category:${name}`, status: 'ok' });
    } catch (error) {
      const msg = String(error);
      if (msg.includes('409')) {
        results.push({ step: `category:${name}`, status: 'ok' });
      } else {
        results.push({ step: `category:${name}`, status: 'error', error: msg });
      }
    }
  }

  const allOk = results.every((r) => r.status === 'ok');
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 207 });
}
