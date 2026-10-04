import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const specialties = [
  {
    id: "neurology",
    name: "Neurologist",
    description: "Headaches, nerves, brain and neurological conditions",
    sortOrder: 1,
  },
  {
    id: "cardiology",
    name: "Cardiologist",
    description: "Heart, blood pressure and circulation",
    sortOrder: 2,
  },
  {
    id: "dermatology",
    name: "Dermatologist",
    description: "Skin, hair and nail conditions",
    sortOrder: 3,
  },
  {
    id: "general",
    name: "General Physician",
    description: "Everyday illness, routine checkups and general medical care",
    sortOrder: 4,
  },
  {
    id: "orthopedics",
    name: "Orthopedic",
    description: "Bones, joints, fractures and sports injuries",
    sortOrder: 5,
  },
  {
    id: "dentist",
    name: "Dentist",
    description: "Teeth, gums, oral health and dental care",
    sortOrder: 6,
  },
  {
    id: "gynecologist",
    name: "Gynecologist",
    description: "Women's reproductive health and related care",
    sortOrder: 7,
  },
  {
    id: "psychiatrist",
    name: "Psychiatrist",
    description: "Mental health, mood disorders and psychiatric care",
    sortOrder: 8,
  },
  // Keep existing pediatrics category so current pediatric doctors remain valid
  {
    id: "pediatrics",
    name: "Pediatrics",
    description: "Care for infants, children and teens",
    sortOrder: 9,
  },
];

async function main() {
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
    console.log(`Upserted: ${specialty.name} (${specialty.id})`);
  }

  const rows = await prisma.specialty.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("\nAll specialties in DB:");
  for (const row of rows) {
    console.log(`- ${row.sortOrder}. ${row.name} [${row.id}]`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
