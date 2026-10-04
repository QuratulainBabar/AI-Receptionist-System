import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const specialties = [
  { id: "neurology", name: "Neurologist", description: "Headaches, nerves, brain and neurological conditions", sortOrder: 1 },
  { id: "cardiology", name: "Cardiologist", description: "Heart, blood pressure and circulation", sortOrder: 2 },
  { id: "dermatology", name: "Dermatologist", description: "Skin, hair and nail conditions", sortOrder: 3 },
  { id: "general", name: "General Physician", description: "Everyday illness, routine checkups and general medical care", sortOrder: 4 },
  { id: "orthopedics", name: "Orthopedic", description: "Bones, joints, fractures and sports injuries", sortOrder: 5 },
  { id: "dentist", name: "Dentist", description: "Teeth, gums, oral health and dental care", sortOrder: 6 },
  { id: "gynecologist", name: "Gynecologist", description: "Women's reproductive health and related care", sortOrder: 7 },
  { id: "psychiatrist", name: "Psychiatrist", description: "Mental health, mood disorders and psychiatric care", sortOrder: 8 },
  { id: "pediatrics", name: "Pediatrics", description: "Care for infants, children and teens", sortOrder: 9 },
];

const doctorSeeds = [
  {
    email: "doctor@example.com",
    password: "Doctor123",
    fullName: "Dr. Daniel Osei",
    reference: "DR-1042",
    specialtyId: "cardiology",
    experienceYears: 12,
    rating: 4.9,
    reviews: 128,
    clinic: "Northgate Medical Centre",
    fee: "$60",
    languages: ["English", "French"],
    about: "Consultant cardiologist focused on hypertension, arrhythmia and preventive heart care for adults.",
    slotPattern: [10, 30, 11, 0, 14, 0, 15, 30],
  },
  {
    email: "priya.raman@example.com",
    password: "Doctor123",
    fullName: "Dr. Priya Raman",
    reference: "DR-1043",
    specialtyId: "cardiology",
    experienceYears: 8,
    rating: 4.8,
    reviews: 96,
    clinic: "Northgate Medical Centre",
    fee: "$55",
    languages: ["English", "Tamil", "Hindi"],
    about: "Cardiologist with a special interest in heart failure follow-up and cardiac rehabilitation.",
    slotPattern: [9, 0, 13, 15, 16, 0],
  },
  {
    email: "lena.sorensen@example.com",
    password: "Doctor123",
    fullName: "Dr. Lena Sorensen",
    reference: "DR-1044",
    specialtyId: "dermatology",
    experienceYears: 15,
    rating: 4.7,
    reviews: 211,
    clinic: "Lakeside Skin Clinic",
    fee: "$70",
    languages: ["English", "Danish"],
    about: "Dermatologist treating eczema, acne, and skin lesion screening for all ages.",
    slotPattern: [9, 0, 10, 30, 14, 30],
  },
  {
    email: "jonah.mir@example.com",
    password: "Doctor123",
    fullName: "Dr. Jonah Mir",
    reference: "DR-1045",
    specialtyId: "neurology",
    experienceYears: 10,
    rating: 4.8,
    reviews: 74,
    clinic: "Northgate Medical Centre",
    fee: "$80",
    languages: ["English", "Urdu"],
    about: "Neurologist specialising in migraine management, epilepsy and nerve pain.",
    slotPattern: [11, 30, 13, 0, 15, 0],
  },
  {
    email: "marta.alvarez@example.com",
    password: "Doctor123",
    fullName: "Dr. Marta Alvarez",
    reference: "DR-1046",
    specialtyId: "pediatrics",
    experienceYears: 9,
    rating: 4.9,
    reviews: 183,
    clinic: "Riverside Family Practice",
    fee: "$45",
    languages: ["English", "Spanish"],
    about: "Pediatrician handling growth checks, vaccinations and childhood illness.",
    slotPattern: [10, 0, 12, 0, 16, 0],
  },
  {
    email: "kwesi.boateng@example.com",
    password: "Doctor123",
    fullName: "Dr. Kwesi Boateng",
    reference: "DR-1047",
    specialtyId: "orthopedics",
    experienceYears: 14,
    rating: 4.6,
    reviews: 132,
    clinic: "Lakeside Sports Medicine",
    fee: "$75",
    languages: ["English"],
    about: "Orthopedic surgeon focused on knee and shoulder injuries and post-op recovery.",
    slotPattern: [9, 30, 11, 0, 14, 0],
  },
  {
    email: "ellen.chen@example.com",
    password: "Doctor123",
    fullName: "Dr. Ellen Chen",
    reference: "DR-1048",
    specialtyId: "general",
    experienceYears: 7,
    rating: 4.8,
    reviews: 154,
    clinic: "Riverside Family Practice",
    fee: "$40",
    languages: ["English", "Mandarin"],
    about: "Family physician for routine checkups, chronic care reviews and referrals.",
    slotPattern: [9, 0, 14, 45, 16, 30],
  },
];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildSlots(pattern: number[], from: Date, days: number) {
  const slots: { startsAt: Date; isBooked: boolean }[] = [];
  const base = startOfDay(from);

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(base);
    day.setDate(base.getDate() + dayOffset);
    // Close Wednesdays for demo variety
    if (day.getDay() === 3) continue;

    for (let i = 0; i < pattern.length; i += 2) {
      const hour = pattern[i]!;
      const minute = pattern[i + 1]!;
      const startsAt = new Date(day);
      startsAt.setHours(hour, minute, 0, 0);
      if (startsAt.getTime() <= Date.now()) continue;
      // Mark a couple of mid-day slots booked for realism
      const isBooked = hour === 11 && minute === 0;
      slots.push({ startsAt, isBooked });
    }
  }

  return slots;
}

async function main() {
  const patientHash = await bcrypt.hash("Patient123", 12);
  const doctorHash = await bcrypt.hash("Doctor123", 12);
  const adminHash = await bcrypt.hash("Admin123", 12);

  await prisma.user.upsert({
    where: { email: "patient@example.com" },
    update: {
      fullName: "Maya Okonkwo",
      passwordHash: patientHash,
      role: Role.PATIENT,
      reference: "PT-4821",
      isActive: true,
    },
    create: {
      email: "patient@example.com",
      fullName: "Maya Okonkwo",
      passwordHash: patientHash,
      role: Role.PATIENT,
      reference: "PT-4821",
      isActive: true,
    },
  });

  const patient = await prisma.user.findUniqueOrThrow({ where: { email: "patient@example.com" } });
  await prisma.patientMedicalHistory.upsert({
    where: { userId: patient.id },
    update: {
      age: 34,
      gender: "Female",
      bloodGroup: "O+",
      phone: "+1 (415) 555-0148",
      symptoms: "Occasional dizziness in the morning, mild headaches after work...",
      conditions: ["Hypertension (since 2022)", "Seasonal asthma"],
      allergies: ["Penicillin", "Pollen"],
      medications: ["Amlodipine 5mg — once daily", "Salbutamol inhaler — as needed"],
      surgeries: ["Appendectomy, 2014"],
      familyHistory: ["Father — hypertension", "Mother — type 2 diabetes"],
    },
    create: {
      userId: patient.id,
      age: 34,
      gender: "Female",
      bloodGroup: "O+",
      phone: "+1 (415) 555-0148",
      symptoms: "Occasional dizziness in the morning, mild headaches after work...",
      conditions: ["Hypertension (since 2022)", "Seasonal asthma"],
      allergies: ["Penicillin", "Pollen"],
      medications: ["Amlodipine 5mg — once daily", "Salbutamol inhaler — as needed"],
      surgeries: ["Appendectomy, 2014"],
      familyHistory: ["Father — hypertension", "Mother — type 2 diabetes"],
    },
  });

  const uploadsRoot = path.resolve(process.cwd(), "uploads", "records");
  fs.mkdirSync(uploadsRoot, { recursive: true });

  const sampleRecords = [
    {
      fileName: "ECG_Report_Aug2026.pdf",
      category: "ECG",
      uploadedBy: "Maya Okonkwo",
      mimeType: "application/pdf",
      content: "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nSample ECG report for Maya Okonkwo\n",
      createdAt: new Date("2026-08-27T10:00:00.000Z"),
    },
    {
      fileName: "Blood_Panel_Aug2026.pdf",
      category: "Lab result",
      uploadedBy: "Northgate Lab",
      mimeType: "application/pdf",
      content: "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nSample blood panel for Maya Okonkwo\n",
      createdAt: new Date("2026-08-26T10:00:00.000Z"),
    },
    {
      fileName: "Chest_XRay_Jul2026.jpg",
      category: "Imaging",
      uploadedBy: "Lakeside Imaging",
      mimeType: "image/jpeg",
      content: null as string | null,
      createdAt: new Date("2026-07-11T10:00:00.000Z"),
    },
    {
      fileName: "Prescription_Jul2026.pdf",
      category: "Prescription",
      uploadedBy: "Dr. Ellen Chen",
      mimeType: "application/pdf",
      content: "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nSample prescription for Maya Okonkwo\n",
      createdAt: new Date("2026-07-11T12:00:00.000Z"),
    },
  ];

  // Minimal valid 1x1 JPEG
  const tinyJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
    "base64",
  );

  const existingCount = await prisma.patientMedicalRecord.count({ where: { userId: patient.id } });
  if (existingCount === 0) {
    for (const sample of sampleRecords) {
      const storageName = `seed-${sample.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const absolute = path.join(uploadsRoot, storageName);
      if (sample.mimeType === "image/jpeg") {
        fs.writeFileSync(absolute, tinyJpeg);
      } else {
        fs.writeFileSync(absolute, sample.content ?? "sample");
      }
      const sizeBytes = fs.statSync(absolute).size;
      await prisma.patientMedicalRecord.create({
        data: {
          userId: patient.id,
          fileName: sample.fileName,
          category: sample.category,
          mimeType: sample.mimeType,
          sizeBytes,
          storagePath: storageName,
          uploadedBy: sample.uploadedBy,
          createdAt: sample.createdAt,
          updatedAt: sample.createdAt,
        },
      });
    }
  }

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      fullName: "Super Admin",
      passwordHash: adminHash,
      role: Role.SUPER_ADMIN,
      reference: "SA-1001",
      isActive: true,
    },
    create: {
      email: "admin@example.com",
      fullName: "Super Admin",
      passwordHash: adminHash,
      role: Role.SUPER_ADMIN,
      reference: "SA-1001",
      isActive: true,
    },
  });

  for (const specialty of specialties) {
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

  for (const seed of doctorSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {
        fullName: seed.fullName,
        passwordHash: doctorHash,
        role: Role.DOCTOR,
        reference: seed.reference,
        isActive: true,
      },
      create: {
        email: seed.email,
        fullName: seed.fullName,
        passwordHash: doctorHash,
        role: Role.DOCTOR,
        reference: seed.reference,
        isActive: true,
      },
    });

    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {
        specialtyId: seed.specialtyId,
        experienceYears: seed.experienceYears,
        rating: seed.rating,
        reviews: seed.reviews,
        clinic: seed.clinic,
        fee: seed.fee,
        languages: seed.languages,
        about: seed.about,
      },
      create: {
        userId: user.id,
        specialtyId: seed.specialtyId,
        experienceYears: seed.experienceYears,
        rating: seed.rating,
        reviews: seed.reviews,
        clinic: seed.clinic,
        fee: seed.fee,
        languages: seed.languages,
        about: seed.about,
      },
    });

    await prisma.availabilitySlot.deleteMany({
      where: { doctorId: profile.id, appointment: { is: null } },
    });
    const slots = buildSlots(seed.slotPattern, new Date(), 14);
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
  }

  console.log("Seeded patient medical history, admin, specialties, doctors, and availability slots.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
