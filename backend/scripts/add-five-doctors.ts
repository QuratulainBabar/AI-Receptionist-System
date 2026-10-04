import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const doctors = [
  {
    gender: "male",
    email: "ahmed.hassan@example.com",
    fullName: "Dr. Ahmed Hassan",
    reference: "DR-2101",
    specialtyId: "cardiology",
    experienceYears: 11,
    rating: 4.8,
    reviews: 142,
    clinic: "Northgate Medical Centre",
    fee: "$65",
    languages: ["English", "Arabic", "Urdu"],
    about:
      "Male cardiologist focused on blood pressure management, chest pain assessment, and preventive heart care.",
    slotPattern: [9, 30, 11, 0, 14, 30, 16, 0],
  },
  {
    gender: "male",
    email: "michael.torres@example.com",
    fullName: "Dr. Michael Torres",
    reference: "DR-2102",
    specialtyId: "orthopedics",
    experienceYears: 13,
    rating: 4.7,
    reviews: 118,
    clinic: "Lakeside Sports Medicine",
    fee: "$78",
    languages: ["English", "Spanish"],
    about:
      "Male orthopedic specialist for joint pain, sports injuries, and post-injury rehabilitation.",
    slotPattern: [10, 0, 12, 0, 15, 0],
  },
  {
    gender: "male",
    email: "james.okonkwo@example.com",
    fullName: "Dr. James Okonkwo",
    reference: "DR-2103",
    specialtyId: "general",
    experienceYears: 9,
    rating: 4.9,
    reviews: 167,
    clinic: "Riverside Family Practice",
    fee: "$42",
    languages: ["English"],
    about:
      "Male family physician for routine checkups, chronic disease follow-up, and general medical advice.",
    slotPattern: [9, 0, 10, 30, 13, 30, 15, 30],
  },
  {
    gender: "female",
    email: "fatima.khan@example.com",
    fullName: "Dr. Fatima Khan",
    reference: "DR-2104",
    specialtyId: "pediatrics",
    experienceYears: 10,
    rating: 4.9,
    reviews: 201,
    clinic: "Riverside Family Practice",
    fee: "$48",
    languages: ["English", "Urdu", "Hindi"],
    about:
      "Female pediatrician providing child wellness visits, vaccinations, and common childhood illness care.",
    slotPattern: [9, 0, 11, 30, 14, 0, 16, 0],
  },
  {
    gender: "female",
    email: "sophia.berg@example.com",
    fullName: "Dr. Sophia Berg",
    reference: "DR-2105",
    specialtyId: "neurology",
    experienceYears: 12,
    rating: 4.8,
    reviews: 134,
    clinic: "Northgate Medical Centre",
    fee: "$82",
    languages: ["English", "Swedish"],
    about:
      "Female neurologist specialising in migraine care, nerve pain, and neurological consultations.",
    slotPattern: [10, 30, 13, 0, 15, 30],
  },
] as const;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildSlots(pattern: readonly number[], from: Date, days: number) {
  const slots: { startsAt: Date; isBooked: boolean }[] = [];
  const base = startOfDay(from);

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(base);
    day.setDate(base.getDate() + dayOffset);
    if (day.getDay() === 3) continue;

    for (let i = 0; i < pattern.length; i += 2) {
      const hour = pattern[i]!;
      const minute = pattern[i + 1]!;
      const startsAt = new Date(day);
      startsAt.setHours(hour, minute, 0, 0);
      if (startsAt.getTime() <= Date.now()) continue;
      const isBooked = hour === 11 && minute === 0;
      slots.push({ startsAt, isBooked });
    }
  }

  return slots;
}

async function main() {
  const passwordHash = await bcrypt.hash("Doctor123", 12);

  for (const specialty of [
    { id: "neurology", name: "Neurologist", description: "Headaches, nerves, brain and neurological conditions", sortOrder: 1 },
    { id: "cardiology", name: "Cardiologist", description: "Heart, blood pressure and circulation", sortOrder: 2 },
    { id: "dermatology", name: "Dermatologist", description: "Skin, hair and nail conditions", sortOrder: 3 },
    { id: "general", name: "General Physician", description: "Everyday illness, routine checkups and general medical care", sortOrder: 4 },
    { id: "orthopedics", name: "Orthopedic", description: "Bones, joints, fractures and sports injuries", sortOrder: 5 },
    { id: "dentist", name: "Dentist", description: "Teeth, gums, oral health and dental care", sortOrder: 6 },
    { id: "gynecologist", name: "Gynecologist", description: "Women's reproductive health and related care", sortOrder: 7 },
    { id: "psychiatrist", name: "Psychiatrist", description: "Mental health, mood disorders and psychiatric care", sortOrder: 8 },
    { id: "pediatrics", name: "Pediatrics", description: "Care for infants, children and teens", sortOrder: 9 },
  ]) {
    await prisma.specialty.upsert({
      where: { id: specialty.id },
      update: {
        name: specialty.name,
        description: specialty.description,
        sortOrder: specialty.sortOrder,
      },
      create: specialty,
    });
  }

  for (const doctor of doctors) {
    const existingRef = await prisma.user.findUnique({ where: { reference: doctor.reference } });
    if (existingRef && existingRef.email !== doctor.email) {
      throw new Error(`Reference ${doctor.reference} already used by ${existingRef.email}`);
    }

    const user = await prisma.user.upsert({
      where: { email: doctor.email },
      update: {
        fullName: doctor.fullName,
        passwordHash,
        role: Role.DOCTOR,
        reference: doctor.reference,
        isActive: true,
      },
      create: {
        email: doctor.email,
        fullName: doctor.fullName,
        passwordHash,
        role: Role.DOCTOR,
        reference: doctor.reference,
        isActive: true,
      },
    });

    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {
        specialtyId: doctor.specialtyId,
        experienceYears: doctor.experienceYears,
        rating: doctor.rating,
        reviews: doctor.reviews,
        clinic: doctor.clinic,
        fee: doctor.fee,
        languages: [...doctor.languages],
        about: doctor.about,
      },
      create: {
        userId: user.id,
        specialtyId: doctor.specialtyId,
        experienceYears: doctor.experienceYears,
        rating: doctor.rating,
        reviews: doctor.reviews,
        clinic: doctor.clinic,
        fee: doctor.fee,
        languages: [...doctor.languages],
        about: doctor.about,
      },
    });

    await prisma.availabilitySlot.deleteMany({
      where: { doctorId: profile.id, appointment: { is: null } },
    });

    const slots = buildSlots(doctor.slotPattern, new Date(), 14);
    if (slots.length) {
      await prisma.availabilitySlot.createMany({
        data: slots.map((slot) => ({
          doctorId: profile.id,
          startsAt: slot.startsAt,
          isBooked: slot.isBooked,
        })),
        skipDuplicates: true,
      });
    }

    console.log(`Added ${doctor.gender}: ${doctor.fullName} (${doctor.email}) — ${doctor.reference}`);
  }

  const totalDoctors = await prisma.user.count({ where: { role: Role.DOCTOR, isActive: true } });
  console.log(`Done. Active doctors in DB: ${totalDoctors}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
