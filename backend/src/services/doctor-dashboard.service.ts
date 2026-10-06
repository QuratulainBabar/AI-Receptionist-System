import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  listAppointmentsForDoctor,
  type PublicAppointment,
} from "./appointments.service.js";
import { listPatientsForDoctor } from "./doctor-patients.service.js";
import {
  listNotificationsForDoctor,
  type PublicDoctorNotification,
} from "./notifications.service.js";
import { getCurrentSubscriptionForUser } from "./subscription.service.js";

export type DoctorDashboard = {
  doctorName: string;
  speciality: string;
  clinic: string;
  todayVisitsCount: number;
  awaitingConfirmCount: number;
  unreadAlerts: number;
  patientsCount: number;
  todayAppointments: PublicAppointment[];
  latestNotifications: PublicDoctorNotification[];
  subscription: Awaited<ReturnType<typeof getCurrentSubscriptionForUser>>;
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function isActiveUpcoming(appointment: PublicAppointment, now: number) {
  if (appointment.status === "cancelled" || appointment.status === "completed") return false;
  return new Date(appointment.startsAt).getTime() >= now;
}

function isToday(appointment: PublicAppointment, dayStart: number, dayEnd: number) {
  if (appointment.status === "cancelled" || appointment.status === "completed") return false;
  const startsAt = new Date(appointment.startsAt).getTime();
  return startsAt >= dayStart && startsAt <= dayEnd;
}

export async function getDoctorDashboard(doctorUserId: string): Promise<DoctorDashboard> {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorUserId },
    include: {
      doctorProfile: {
        include: { specialty: true },
      },
    },
  });

  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view the dashboard");
  }

  const now = Date.now();
  const dayStart = startOfDay(new Date()).getTime();
  const dayEnd = endOfDay(new Date()).getTime();

  const [appointments, notifications, patients, subscription] = await Promise.all([
    listAppointmentsForDoctor(doctorUserId),
    listNotificationsForDoctor(doctorUserId),
    listPatientsForDoctor(doctorUserId),
    getCurrentSubscriptionForUser(doctorUserId),
  ]);

  const todayAppointments = appointments
    .filter((appointment) => isToday(appointment, dayStart, dayEnd))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const awaitingConfirmCount = appointments.filter(
    (appointment) => appointment.status === "pending" && isActiveUpcoming(appointment, now),
  ).length;

  return {
    doctorName: doctor.fullName,
    speciality: doctor.doctorProfile?.specialty.name ?? "General Medicine",
    clinic: doctor.doctorProfile?.clinic ?? "",
    todayVisitsCount: todayAppointments.length,
    awaitingConfirmCount,
    unreadAlerts: notifications.length,
    patientsCount: patients.length,
    todayAppointments,
    latestNotifications: notifications.slice(0, 3),
    subscription,
  };
}
