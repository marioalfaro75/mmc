// Shared cookie attribute helpers so every auth-cookie write picks up the
// same HttpOnly/SameSite/Secure flags. HTTPS_ONLY=1 in .env opts in to the
// Secure flag (browser refuses to send the cookie over plain HTTP).

const HTTPS_ONLY = process.env.HTTPS_ONLY === '1' || process.env.HTTPS_ONLY === 'true';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: HTTPS_ONLY,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: THIRTY_DAYS,
};

export const HAS_ADMINS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: HTTPS_ONLY,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: TEN_YEARS,
};
