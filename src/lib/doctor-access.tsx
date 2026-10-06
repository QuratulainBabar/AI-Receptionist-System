import { createContext, useContext } from "react";
import type { ApiDoctorAccess } from "@/lib/api";

export const DoctorAccessContext = createContext<ApiDoctorAccess | null>(null);

export function useDoctorAccess() {
  const value = useContext(DoctorAccessContext);
  if (!value) {
    throw new Error("Doctor access is not loaded");
  }
  return value;
}
