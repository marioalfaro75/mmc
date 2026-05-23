// Helpers for safely embedding user input into generated shell scripts and
// /etc/fstab entries. Extracted from the migration route so they're testable
// without spinning up Next.js.

export function resolvePath(p: string): string {
  if (p.startsWith('~')) return `${process.env.HOME}${p.slice(1)}`;
  return p;
}

// Wraps a string in single quotes for bash, escaping any embedded single
// quotes by closing the quote, inserting an escaped quote, and reopening.
export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// Path is "safe" if it only contains characters legal in fstab entries and
// doesn't contain a parent-directory traversal segment.
export function isValidPath(p: string): boolean {
  return /^[a-zA-Z0-9/._ -]+$/.test(p) && !p.includes('..');
}

// Host part of an SMB/NFS mount source — IPv4, hostname, or FQDN.
export function isValidHost(h: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(h);
}
