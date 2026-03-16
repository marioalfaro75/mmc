import { NextRequest, NextResponse } from 'next/server';

/* ------------------------------------------------------------------ */
/*  Rate limiting – simple in-memory Map with lazy cleanup             */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120;

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateEntry>();
let lastCleanup = Date.now();

function getRateLimitResult(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Lazy cleanup every 5 minutes
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    rateLimitMap.forEach((entry, key) => {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    });
  }

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  return { allowed: true, retryAfter: 0 };
}

/* ------------------------------------------------------------------ */
/*  Security headers applied to every response                         */
/* ------------------------------------------------------------------ */

function applySecurityHeaders(res: NextResponse): void {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

/* ------------------------------------------------------------------ */
/*  Login page – inline HTML                                           */
/* ------------------------------------------------------------------ */

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login - Mars Media Centre</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b; /* zinc-950 */
      color: #f4f4f5;      /* zinc-100 */
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #18181b; /* zinc-900 */
      border: 1px solid #27272a; /* zinc-800 */
      border-radius: 0.75rem;
      padding: 2.5rem;
      width: 100%;
      max-width: 24rem;
    }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    p.sub { color: #a1a1aa; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; margin-bottom: 0.375rem; }
    input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      border: 1px solid #27272a;
      background: #09090b;
      color: #f4f4f5;
      font-size: 0.875rem;
      outline: none;
    }
    input:focus { border-color: #2563eb; }
    button {
      margin-top: 1rem;
      width: 100%;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      border: none;
      background: #2563eb; /* blue-600 */
      color: #fff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .error { color: #ef4444; font-size: 0.8rem; margin-top: 0.75rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mars Media Centre</h1>
    <p class="sub">Enter your API key to continue.</p>
    <form id="loginForm">
      <label for="key">API Key</label>
      <input type="password" id="key" name="key" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
      <p class="error" id="error">Invalid API key. Please try again.</p>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var errEl = document.getElementById('error');
      errEl.style.display = 'none';
      var key = document.getElementById('key').value;
      try {
        var res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key })
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          errEl.style.display = 'block';
        }
      } catch (_) {
        errEl.textContent = 'Network error. Please try again.';
        errEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;

/* ------------------------------------------------------------------ */
/*  Middleware                                                          */
/* ------------------------------------------------------------------ */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

  // --- Rate limiting ---
  const rateResult = getRateLimitResult(ip);
  if (!rateResult.allowed) {
    const res = NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(rateResult.retryAfter));
    applySecurityHeaders(res);
    return res;
  }

  // --- CSRF protection for mutating API requests ---
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)
  ) {
    const origin = request.headers.get('origin');
    if (origin) {
      const host = request.headers.get('host');
      try {
        const originHost = new URL(origin).host;
        if (host && originHost !== host) {
          const res = NextResponse.json(
            { error: 'CSRF validation failed' },
            { status: 403 }
          );
          applySecurityHeaders(res);
          return res;
        }
      } catch {
        const res = NextResponse.json(
          { error: 'CSRF validation failed' },
          { status: 403 }
        );
        applySecurityHeaders(res);
        return res;
      }
    }
  }

  // --- Handle /login routes ---
  if (pathname === '/login') {
    if (request.method === 'GET') {
      const res = new NextResponse(LOGIN_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
      applySecurityHeaders(res);
      return res;
    }

    if (request.method === 'POST') {
      const apiKey = process.env.MMC_API_KEY || '';
      try {
        const body = await request.json();
        const submittedKey = body?.key;
        if (apiKey && submittedKey === apiKey) {
          const res = NextResponse.json({ ok: true }, { status: 200 });
          res.cookies.set('mmc-auth', apiKey, {
            httpOnly: true,
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          });
          applySecurityHeaders(res);
          return res;
        }
      } catch {
        // fall through to 401
      }
      const res = NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      applySecurityHeaders(res);
      return res;
    }
  }

  // --- Authentication ---
  const apiKey = process.env.MMC_API_KEY;
  if (apiKey) {
    // Paths that skip auth
    const isPublic =
      pathname === '/api/health' ||
      pathname === '/login' ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico';

    if (!isPublic) {
      const cookieAuth = request.cookies.get('mmc-auth')?.value;
      const headerAuth = request.headers.get('x-api-key');
      const authenticated = cookieAuth === apiKey || headerAuth === apiKey;

      if (!authenticated) {
        if (pathname.startsWith('/api/')) {
          const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          applySecurityHeaders(res);
          return res;
        }
        // Page request → redirect to login
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.search = '';
        const res = NextResponse.redirect(loginUrl);
        applySecurityHeaders(res);
        return res;
      }
    }
  }

  // --- Default: continue with security headers ---
  const res = NextResponse.next();
  applySecurityHeaders(res);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
