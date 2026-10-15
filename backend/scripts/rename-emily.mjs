import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const appt = await p.appointment.findFirst({
  where: { reference: "APT-2499" },
  include: { patient: true, doctorUser: true },
});
if (!appt) {
  console.log("APT-2499 not found");
  process.exit(1);
}
await p.user.update({ where: { id: appt.patientId }, data: { fullName: "Emily Wit" } });
const again = await p.appointment.findUnique({
  where: { id: appt.id },
  include: { patient: true, doctorUser: true },
});
console.log({
  reference: again.reference,
  status: again.status,
  patient: again.patient.fullName,
  doctor: again.doctorUser.fullName,
  startsAt: again.startsAt.toISOString(),
  phone: again.bookingPhone,
});
await p.$disconnect();
