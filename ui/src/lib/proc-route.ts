// Parser for /proc/net/route lines. The file stores IPs as little-endian
// 32-bit hex (the kernel's native byte order on little-endian machines is
// preserved through to userspace as-is). Extracted into its own module so
// the byte-twiddling is unit-testable without needing a docker daemon.

export function formatHexIp(hex: number): string {
  return [hex & 0xff, (hex >> 8) & 0xff, (hex >> 16) & 0xff, (hex >> 24) & 0xff].join('.');
}

export function maskToCidr(mask: number): number {
  const swapped =
    ((mask & 0xff) << 24) | (((mask >> 8) & 0xff) << 16) | (((mask >> 16) & 0xff) << 8) | ((mask >> 24) & 0xff);
  let bits = 0;
  let x = swapped >>> 0;
  while (x) {
    bits += x & 1;
    x >>>= 1;
  }
  return bits;
}

// Turns one /proc/net/route row (post-header) into a human-readable
// `ip route`-style string. Returns null for malformed input.
export function formatRouteRow(raw: string): string | null {
  const cols = raw.trim().split(/\s+/);
  if (cols.length < 8) return null;
  const iface = cols[0];
  const dest = parseInt(cols[1], 16);
  const gw = parseInt(cols[2], 16);
  const mask = parseInt(cols[7], 16);
  if (Number.isNaN(dest) || Number.isNaN(gw) || Number.isNaN(mask)) return null;
  if (dest === 0 && mask === 0) return `default via ${formatHexIp(gw)} dev ${iface}`;
  const cidr = maskToCidr(mask);
  return `${formatHexIp(dest)}/${cidr} dev ${iface}${gw !== 0 ? ` via ${formatHexIp(gw)}` : ''}`;
}
