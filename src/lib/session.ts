// UI-only mock session. No real authentication, no backend.
import { currentDoctor, currentPatient, initials, type Role } from "@/lib/mock-data";

export type Session = {
  role: Role;
  name: string;
  email: string;
  reference: string;
  initials: string;
};

const STORAGE_KEY = "ai-receptionist-demo-session";

export const patientSession: Session = {
  role: "patient",
  name: currentPatient.name,
  email: currentPatient.email,
  reference: currentPatient.reference,
  initials: initials(currentPatient.name),
};

export const doctorSession: Session = {
  role: "doctor",
  name: currentDoctor.name,
  email: currentDoctor.email,
  reference: currentDoctor.reference,
  initials: initials(currentDoctor.name),
};

export function saveSession(role: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, role);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function sessionFor(role: Role): Session {
  return role === "doctor" ? doctorSession : patientSession;
}
