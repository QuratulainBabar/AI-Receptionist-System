import { initials, type Role } from "@/lib/mock-data";
import type { ApiUser, AuthRole } from "@/lib/api";

export type Session = {
  role: AuthRole;
  name: string;
  email: string;
  reference: string;
  initials: string;
  token?: string;
  userId?: string;
  isActive?: boolean;
};

const SESSION_KEY = "ai-receptionist-session";
const TOKEN_KEY = "ai-receptionist-token";

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function homeForRole(role: AuthRole) {
  if (role === "admin") return "/admin";
  if (role === "doctor") return "/doctor";
  return "/patient";
}

export function loginPathForRole(role: AuthRole) {
  return role === "admin" ? "/admin/login" : "/";
}

export function sessionFromUser(user: ApiUser, token: string): Session {
  return {
    role: user.role,
    name: user.fullName,
    email: user.email,
    reference: user.reference,
    initials: initials(user.fullName),
    token,
    userId: user.id,
    isActive: user.isActive,
  };
}

export function saveAuth(user: ApiUser, token: string) {
  if (typeof window === "undefined") return;
  const session = sessionFromUser(user, token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getSession(): Session | null {
  return readJson<Session>(SESSION_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem("ai-receptionist-demo-session");
}

/** @deprecated Use saveAuth */
export function saveSession(role: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("ai-receptionist-demo-session", role);
}

export function sessionFor(role: Role): Session {
  const live = getSession();
  if (live && live.role === role) return live;
  return {
    role,
    name: role === "doctor" ? "Doctor" : "Patient",
    email: "",
    reference: role === "doctor" ? "DR-0000" : "PT-0000",
    initials: role === "doctor" ? "DR" : "PT",
  };
}

export const patientSession: Session = sessionFor("patient");
export const doctorSession: Session = sessionFor("doctor");
