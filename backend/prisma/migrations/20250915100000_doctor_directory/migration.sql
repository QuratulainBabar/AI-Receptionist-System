-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "experienceYears" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "clinic" TEXT NOT NULL,
    "fee" TEXT NOT NULL,
    "languages" TEXT[],
    "about" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_userId_key" ON "doctor_profiles"("userId");

-- CreateIndex
CREATE INDEX "doctor_profiles_specialtyId_idx" ON "doctor_profiles"("specialtyId");

-- CreateIndex
CREATE INDEX "doctor_profiles_clinic_idx" ON "doctor_profiles"("clinic");

-- CreateIndex
CREATE INDEX "availability_slots_doctorId_startsAt_idx" ON "availability_slots"("doctorId", "startsAt");

-- CreateIndex
CREATE INDEX "availability_slots_startsAt_isBooked_idx" ON "availability_slots"("startsAt", "isBooked");

-- CreateIndex
CREATE UNIQUE INDEX "availability_slots_doctorId_startsAt_key" ON "availability_slots"("doctorId", "startsAt");

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
