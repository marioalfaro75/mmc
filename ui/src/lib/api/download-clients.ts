// Read the USE_QBITTORRENT / USE_SABNZBD toggles. Defaults mirror the
// schema (qBit on, SAB off) so a missing env var doesn't surprise anyone.
// Permissive on input: on/true/1/yes → true; off/false/0/no → false;
// empty / unrecognised → schema default. Tolerates the EnvField "Select…"
// placeholder saving an empty string.
function isOn(value: string | undefined, defaultOn: boolean): boolean {
  if (!value) return defaultOn;
  const v = value.trim().toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(v)) return true;
  if (['off', 'false', '0', 'no'].includes(v)) return false;
  return defaultOn;
}

export function downloadClientFlags(): { useQbittorrent: boolean; useSabnzbd: boolean } {
  return {
    useQbittorrent: isOn(process.env.USE_QBITTORRENT, true),
    useSabnzbd: isOn(process.env.USE_SABNZBD, false),
  };
}
