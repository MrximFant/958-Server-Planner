// Auth utilities — password hashing, session management
// Sessions live in localStorage; no Supabase Auth used

const SESSION_KEY = 'lw_planner_session';

// ── Password hashing (SHA-256 via Web Crypto) ─────────────────
export async function hashPassword(plain) {
  const encoded = new TextEncoder().encode(plain);
  const buffer  = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Invite code generation ────────────────────────────────────
export function generateInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session ───────────────────────────────────────────────────
// Shape:
// {
//   serverId:   string,
//   serverName: string,
//   role:       'admin' | 'owner' | 'member',
//   allianceId: string | null,   // owner or member
//   memberId:   string | null,   // member only
//   username:   string | null,   // member only
// }

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) ?? null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function hasRole(session, ...roles) {
  return session && roles.includes(session.role);
}
