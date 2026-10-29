export interface SessionUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  getSessionToken(): Promise<string>;
}
export const auth: { currentUser: SessionUser | null } = { currentUser: null };
const listeners = new Set<(user: SessionUser | null) => void>();
let initialized: Promise<void> | undefined;
function applySession(session: { user?: Omit<SessionUser, "getSessionToken">; token?: string }) {
  auth.currentUser = session.user ? { ...session.user, getSessionToken: async () => session.token! } : null;
  listeners.forEach(fn => fn(auth.currentUser));
  return { user: auth.currentUser };
}
async function initialize() {
  if (typeof window === "undefined") return;
  initialized ??= fetch("/api/local/session").then(r => r.json()).then(applySession).then(() => undefined).catch(() => { applySession({ user: null }); });
  return initialized;
}
export const getAuth = () => auth;
export function onAuthStateChanged(_auth: typeof auth, listener: (user: SessionUser | null) => void) {
  let active = true;
  void initialize().then(() => { if (active) { listeners.add(listener); listener(auth.currentUser); } });
  return () => { active = false; listeners.delete(listener); };
}
export async function signIn() {
  const response = await fetch("/api/local/session", { method: "POST" });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error || "Local sign-in failed");
  return applySession(session);
}
export async function signOut(_auth = auth) {
  const response = await fetch("/api/local/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Local sign-out failed");
  applySession({ user: null });
}
