import type { ClinicStaffRole } from "@prisma/client";

export const CLINIC_PERMISSION_KEYS = [
  "appointments",
  "patients",
  "medicalReports",
  "callTranscriptions",
  "followUps",
  "invoices",
  "availability",
  "clinicSettings",
  "teamMembers",
] as const;

export type ClinicPermissionKey = (typeof CLINIC_PERMISSION_KEYS)[number];

export type ClinicPermissions = Record<ClinicPermissionKey, boolean>;

export const STAFF_ROLE_OPTIONS = [
  {
    id: "RECEPTIONIST" as const,
    label: "Receptionist",
    description:
      "Manage appointments, check availability, view statuses, handle patient contact details, and assist with scheduling.",
  },
  {
    id: "CLINIC_ADMINISTRATOR" as const,
    label: "Clinic Administrator",
    description: "Manage clinic operations, appointments, team members, and permitted clinic settings.",
  },
  {
    id: "OFFICE_MANAGER" as const,
    label: "Office Manager",
    description:
      "Oversee daily clinic operations, appointment schedules, staff coordination, and operational reports.",
  },
  {
    id: "APPOINTMENT_COORDINATOR" as const,
    label: "Appointment Coordinator",
    description:
      "Schedule appointments, reschedule or cancel visits, manage follow-ups, and check available slots.",
  },
  {
    id: "NURSE" as const,
    label: "Nurse / Clinical Assistant",
    description:
      "Access permitted patient information, appointment history, clinical notes, and relevant reports.",
  },
  {
    id: "BILLING" as const,
    label: "Billing / Accounts Staff",
    description: "Manage invoices, payment statuses, and billing records without clinical chart access.",
  },
  {
    id: "ADDITIONAL_DOCTOR" as const,
    label: "Additional Doctor / Healthcare Provider",
    description:
      "Clinical access under the owning doctor's clinic. Does not create a separate subscription or independent provider practice.",
  },
] satisfies Array<{ id: ClinicStaffRole; label: string; description: string }>;

export function emptyPermissions(): ClinicPermissions {
  return {
    appointments: false,
    patients: false,
    medicalReports: false,
    callTranscriptions: false,
    followUps: false,
    invoices: false,
    availability: false,
    clinicSettings: false,
    teamMembers: false,
  };
}

export function allPermissions(): ClinicPermissions {
  return {
    appointments: true,
    patients: true,
    medicalReports: true,
    callTranscriptions: true,
    followUps: true,
    invoices: true,
    availability: true,
    clinicSettings: true,
    teamMembers: true,
  };
}

export function defaultPermissionsForRole(role: ClinicStaffRole): ClinicPermissions {
  const base = emptyPermissions();
  switch (role) {
    case "RECEPTIONIST":
      return {
        ...base,
        appointments: true,
        patients: true,
        followUps: true,
        availability: true,
      };
    case "CLINIC_ADMINISTRATOR":
      return {
        ...allPermissions(),
        medicalReports: true,
        callTranscriptions: false,
      };
    case "OFFICE_MANAGER":
      return {
        ...base,
        appointments: true,
        patients: true,
        followUps: true,
        invoices: true,
        availability: true,
        clinicSettings: true,
        medicalReports: true,
      };
    case "APPOINTMENT_COORDINATOR":
      return {
        ...base,
        appointments: true,
        followUps: true,
        availability: true,
        patients: true,
      };
    case "NURSE":
      return {
        ...base,
        appointments: true,
        patients: true,
        medicalReports: true,
        followUps: true,
      };
    case "BILLING":
      return {
        ...base,
        invoices: true,
        appointments: true,
        patients: true,
      };
    case "ADDITIONAL_DOCTOR":
      return {
        ...allPermissions(),
        teamMembers: false,
        clinicSettings: false,
      };
    default:
      return base;
  }
}

export function normalizePermissions(
  role: ClinicStaffRole,
  input?: Partial<ClinicPermissions> | null,
): ClinicPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (!input || typeof input !== "object") return defaults;
  const next = { ...defaults };
  for (const key of CLINIC_PERMISSION_KEYS) {
    if (typeof input[key] === "boolean") next[key] = input[key]!;
  }
  // Only clinic owners manage the team roster.
  if (role !== "CLINIC_ADMINISTRATOR") next.teamMembers = false;
  return next;
}

export function permissionLabel(key: ClinicPermissionKey) {
  switch (key) {
    case "appointments":
      return "Appointments";
    case "patients":
      return "Patient information";
    case "medicalReports":
      return "Medical reports";
    case "callTranscriptions":
      return "Call transcriptions";
    case "followUps":
      return "Follow-up visits";
    case "invoices":
      return "Invoices & billing";
    case "availability":
      return "Availability";
    case "clinicSettings":
      return "Clinic settings";
    case "teamMembers":
      return "Team members";
    default:
      return key;
  }
}

/** Map stored permissions to doctor portal module ids. */
export function modulesAllowedByPermissions(permissions: ClinicPermissions): Set<string> {
  const allowed = new Set<string>(["dashboard"]);
  if (permissions.appointments || permissions.followUps) allowed.add("schedule");
  if (permissions.appointments || permissions.patients) allowed.add("notifications");
  if (permissions.patients) allowed.add("patients");
  if (permissions.medicalReports) allowed.add("records");
  if (permissions.appointments || permissions.patients) allowed.add("activity");
  if (permissions.callTranscriptions || permissions.clinicSettings) allowed.add("synthflow");
  if (permissions.clinicSettings) allowed.add("profile");
  if (permissions.availability) allowed.add("availability");
  if (permissions.teamMembers) allowed.add("team");
  // Subscription stays owner-only.
  return allowed;
}
