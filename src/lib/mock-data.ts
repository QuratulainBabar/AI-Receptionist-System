// Static mock data only — no backend, no API. Used across all screens.

export type Role = "patient" | "doctor";

export const demoCredentials = [
  // Patient portal is paused. Demo patient stays commented until that work resumes.
  // { role: "patient" as const, email: "patient@example.com", password: "Patient123", label: "Patient" },
  { role: "doctor" as const, email: "doctor@example.com", password: "Doctor123", label: "Doctor" },
  { role: "admin" as const, email: "admin@example.com", password: "Admin123", label: "Super Admin" },
];

export const specialities = [
  { id: "neurology", name: "Neurologist", description: "Headaches, nerves, brain and neurological conditions", doctors: 6 },
  { id: "cardiology", name: "Cardiologist", description: "Heart, blood pressure and circulation", doctors: 8 },
  { id: "dermatology", name: "Dermatologist", description: "Skin, hair and nail conditions", doctors: 5 },
  { id: "general", name: "General Physician", description: "Everyday illness, routine checkups and general medical care", doctors: 11 },
  { id: "orthopedics", name: "Orthopedic", description: "Bones, joints, fractures and sports injuries", doctors: 5 },
  { id: "dentist", name: "Dentist", description: "Teeth, gums, oral health and dental care", doctors: 3 },
  { id: "gynecologist", name: "Gynecologist", description: "Women's reproductive health and related care", doctors: 4 },
  { id: "psychiatrist", name: "Psychiatrist", description: "Mental health, mood disorders and psychiatric care", doctors: 3 },
  { id: "pediatrics", name: "Pediatrics", description: "Care for infants, children and teens", doctors: 6 },
];

export type Doctor = {
  id: string;
  name: string;
  speciality: string;
  specialityId: string;
  experience: string;
  rating: number;
  reviews: number;
  clinic: string;
  fee: string;
  languages: string[];
  about: string;
  nextAvailable: string;
};

export const doctors: Doctor[] = [
  {
    id: "d-osei",
    name: "Dr. Daniel Osei",
    speciality: "Cardiology",
    specialityId: "cardiology",
    experience: "12 years",
    rating: 4.9,
    reviews: 128,
    clinic: "Northgate Medical Centre",
    fee: "$60",
    languages: ["English", "French"],
    about:
      "Consultant cardiologist focused on hypertension, arrhythmia and preventive heart care for adults.",
    nextAvailable: "Today, 10:30 AM",
  },
  {
    id: "d-raman",
    name: "Dr. Priya Raman",
    speciality: "Cardiology",
    specialityId: "cardiology",
    experience: "8 years",
    rating: 4.8,
    reviews: 96,
    clinic: "Northgate Medical Centre",
    fee: "$55",
    languages: ["English", "Tamil", "Hindi"],
    about: "Cardiologist with a special interest in heart failure follow-up and cardiac rehabilitation.",
    nextAvailable: "Tomorrow, 1:15 PM",
  },
  {
    id: "d-sorensen",
    name: "Dr. Lena Sorensen",
    speciality: "Dermatology",
    specialityId: "dermatology",
    experience: "15 years",
    rating: 4.7,
    reviews: 211,
    clinic: "Lakeside Skin Clinic",
    fee: "$70",
    languages: ["English", "Danish"],
    about: "Dermatologist treating eczema, acne, and skin lesion screening for all ages.",
    nextAvailable: "Thu, 9:00 AM",
  },
  {
    id: "d-mir",
    name: "Dr. Jonah Mir",
    speciality: "Neurology",
    specialityId: "neurology",
    experience: "10 years",
    rating: 4.8,
    reviews: 74,
    clinic: "Northgate Medical Centre",
    fee: "$80",
    languages: ["English", "Urdu"],
    about: "Neurologist specialising in migraine management, epilepsy and nerve pain.",
    nextAvailable: "Fri, 11:30 AM",
  },
  {
    id: "d-alvarez",
    name: "Dr. Marta Alvarez",
    speciality: "Pediatrics",
    specialityId: "pediatrics",
    experience: "9 years",
    rating: 4.9,
    reviews: 183,
    clinic: "Riverside Family Practice",
    fee: "$45",
    languages: ["English", "Spanish"],
    about: "Pediatrician handling growth checks, vaccinations and childhood illness.",
    nextAvailable: "Today, 4:00 PM",
  },
  {
    id: "d-boateng",
    name: "Dr. Kwesi Boateng",
    speciality: "Orthopedics",
    specialityId: "orthopedics",
    experience: "14 years",
    rating: 4.6,
    reviews: 132,
    clinic: "Lakeside Sports Medicine",
    fee: "$75",
    languages: ["English"],
    about: "Orthopedic surgeon focused on knee and shoulder injuries and post-op recovery.",
    nextAvailable: "Mon, 9:30 AM",
  },
  {
    id: "d-chen",
    name: "Dr. Ellen Chen",
    speciality: "General Medicine",
    specialityId: "general",
    experience: "7 years",
    rating: 4.8,
    reviews: 154,
    clinic: "Riverside Family Practice",
    fee: "$40",
    languages: ["English", "Mandarin"],
    about: "Family physician for routine checkups, chronic care reviews and referrals.",
    nextAvailable: "Today, 2:45 PM",
  },
];

export const availableDates = [
  { id: "2026-09-15", label: "Mon 15", month: "Sep", slots: 6 },
  { id: "2026-09-16", label: "Tue 16", month: "Sep", slots: 4 },
  { id: "2026-09-17", label: "Wed 17", month: "Sep", slots: 0 },
  { id: "2026-09-18", label: "Thu 18", month: "Sep", slots: 5 },
  { id: "2026-09-19", label: "Fri 19", month: "Sep", slots: 3 },
];

export const timeSlots = [
  { id: "0900", time: "09:00 AM", available: true },
  { id: "0930", time: "09:30 AM", available: true },
  { id: "1030", time: "10:30 AM", available: true },
  { id: "1100", time: "11:00 AM", available: false },
  { id: "1300", time: "01:00 PM", available: true },
  { id: "1430", time: "02:30 PM", available: true },
  { id: "1500", time: "03:00 PM", available: false },
  { id: "1630", time: "04:30 PM", available: true },
];

export type AppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  reference: string;
  doctorId: string;
  doctorName: string;
  speciality: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  duration: string;
  mode: "In clinic" | "Video call";
  reason: string;
  status: AppointmentStatus;
};

export const appointments: Appointment[] = [
  {
    id: "a-1",
    reference: "APT-4821",
    doctorId: "d-osei",
    doctorName: "Dr. Daniel Osei",
    speciality: "Cardiology",
    patientId: "p-maya",
    patientName: "Maya Okonkwo",
    date: "Mon 15 Sep 2026",
    time: "10:30 AM",
    duration: "30 min",
    mode: "In clinic",
    reason: "Blood pressure follow-up",
    status: "confirmed",
  },
  {
    id: "a-2",
    reference: "APT-4822",
    doctorId: "d-osei",
    doctorName: "Dr. Daniel Osei",
    speciality: "Cardiology",
    patientId: "p-tomas",
    patientName: "Tomas Lindqvist",
    date: "Mon 15 Sep 2026",
    time: "11:15 AM",
    duration: "20 min",
    mode: "Video call",
    reason: "Medication review",
    status: "confirmed",
  },
  {
    id: "a-3",
    reference: "APT-4809",
    doctorId: "d-chen",
    doctorName: "Dr. Ellen Chen",
    speciality: "General Medicine",
    patientId: "p-maya",
    patientName: "Maya Okonkwo",
    date: "Wed 27 Aug 2026",
    time: "09:00 AM",
    duration: "20 min",
    mode: "In clinic",
    reason: "Annual checkup",
    status: "completed",
  },
  {
    id: "a-4",
    reference: "APT-4833",
    doctorId: "d-osei",
    doctorName: "Dr. Daniel Osei",
    speciality: "Cardiology",
    patientId: "p-amina",
    patientName: "Amina Yusuf",
    date: "Tue 16 Sep 2026",
    time: "01:00 PM",
    duration: "30 min",
    mode: "In clinic",
    reason: "Chest tightness assessment",
    status: "pending",
  },
  {
    id: "a-5",
    reference: "APT-4795",
    doctorId: "d-sorensen",
    doctorName: "Dr. Lena Sorensen",
    speciality: "Dermatology",
    patientId: "p-maya",
    patientName: "Maya Okonkwo",
    date: "Fri 11 Jul 2026",
    time: "03:30 PM",
    duration: "20 min",
    mode: "In clinic",
    reason: "Skin rash review",
    status: "cancelled",
  },
];

export const currentPatient = {
  id: "p-maya",
  name: "Maya Okonkwo",
  reference: "PT-4821",
  age: 34,
  gender: "Female",
  bloodGroup: "O+",
  phone: "+1 (415) 555-0148",
  email: "patient@example.com",
};

export const currentDoctor = {
  id: "d-osei",
  name: "Dr. Daniel Osei",
  speciality: "Cardiology",
  reference: "DR-1042",
  clinic: "Northgate Medical Centre",
  email: "doctor@example.com",
};

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  reference: string;
  lastVisit: string;
  condition: string;
  phone: string;
};

export const patients: Patient[] = [
  {
    id: "p-maya",
    name: "Maya Okonkwo",
    age: 34,
    gender: "Female",
    reference: "PT-4821",
    lastVisit: "27 Aug 2026",
    condition: "Hypertension",
    phone: "+1 (415) 555-0148",
  },
  {
    id: "p-tomas",
    name: "Tomas Lindqvist",
    age: 57,
    gender: "Male",
    reference: "PT-3390",
    lastVisit: "02 Sep 2026",
    condition: "Arrhythmia",
    phone: "+1 (415) 555-0192",
  },
  {
    id: "p-amina",
    name: "Amina Yusuf",
    age: 41,
    gender: "Female",
    reference: "PT-5117",
    lastVisit: "First visit",
    condition: "Chest tightness",
    phone: "+1 (415) 555-0233",
  },
  {
    id: "p-ravi",
    name: "Ravi Menon",
    age: 62,
    gender: "Male",
    reference: "PT-2984",
    lastVisit: "18 Aug 2026",
    condition: "Post-op review",
    phone: "+1 (415) 555-0177",
  },
];

export const medicalHistory = {
  conditions: ["Hypertension (since 2022)", "Seasonal asthma"],
  allergies: ["Penicillin", "Pollen"],
  medications: ["Amlodipine 5mg — once daily", "Salbutamol inhaler — as needed"],
  surgeries: ["Appendectomy, 2014"],
  lifestyle: { smoking: "Never", alcohol: "Occasional", exercise: "3x per week" },
  familyHistory: ["Father — hypertension", "Mother — type 2 diabetes"],
};

export type MedicalRecord = {
  id: string;
  name: string;
  type: string;
  date: string;
  size: string;
  uploadedBy: string;
};

export const medicalRecords: MedicalRecord[] = [
  { id: "r-1", name: "ECG_Report_Aug2026.pdf", type: "ECG", date: "27 Aug 2026", size: "1.2 MB", uploadedBy: "Maya Okonkwo" },
  { id: "r-2", name: "Blood_Panel_Aug2026.pdf", type: "Lab result", date: "26 Aug 2026", size: "480 KB", uploadedBy: "Northgate Lab" },
  { id: "r-3", name: "Chest_XRay_Jul2026.jpg", type: "Imaging", date: "11 Jul 2026", size: "3.4 MB", uploadedBy: "Lakeside Imaging" },
  { id: "r-4", name: "Prescription_Jul2026.pdf", type: "Prescription", date: "11 Jul 2026", size: "210 KB", uploadedBy: "Dr. Ellen Chen" },
];

export type ChatMessage = {
  id: string;
  from: "ai" | "patient";
  text: string;
  time: string;
  card?: { kind: "doctor"; doctorId: string } | { kind: "slots" } | { kind: "confirmation"; reference: string };
};

export const chatTranscript: ChatMessage[] = [
  {
    id: "m-1",
    from: "ai",
    text: "Hi Maya, I'm the clinic receptionist. I can explain specialities, find a doctor, or book a visit. What do you need today?",
    time: "09:02",
  },
  { id: "m-2", from: "patient", text: "What does a cardiologist actually treat?", time: "09:03" },
  {
    id: "m-3",
    from: "ai",
    text: "A cardiologist treats the heart and circulation — blood pressure, chest pain, palpitations and heart-failure follow-up. Given your blood pressure notes, that's the right fit.",
    time: "09:03",
  },
  { id: "m-4", from: "patient", text: "Is anyone available this week?", time: "09:04" },
  {
    id: "m-5",
    from: "ai",
    text: "Dr. Daniel Osei has openings at Northgate Medical Centre.",
    time: "09:04",
    card: { kind: "doctor", doctorId: "d-osei" },
  },
  { id: "m-6", from: "patient", text: "Yes, let's book with him.", time: "09:05" },
  {
    id: "m-7",
    from: "ai",
    text: "Pick a time on Monday 15 September and I'll confirm it.",
    time: "09:05",
    card: { kind: "slots" },
  },
  { id: "m-8", from: "patient", text: "10:30 AM works.", time: "09:06" },
  {
    id: "m-9",
    from: "ai",
    text: "Booked. A confirmation email is on its way, and I'll send a reminder the day before.",
    time: "09:06",
    card: { kind: "confirmation", reference: "APT-4821" },
  },
];

export const suggestedPrompts = [
  "Which speciality do I need?",
  "Show cardiologists this week",
  "Reschedule my appointment",
  "What should I bring?",
];

export type FollowUp = {
  id: string;
  channel: "Email" | "SMS";
  subject: string;
  preview: string;
  sentAt: string;
  status: "Delivered" | "Scheduled" | "Opened";
};

export const followUps: FollowUp[] = [
  {
    id: "f-1",
    channel: "Email",
    subject: "Your appointment is confirmed — APT-4821",
    preview: "Mon 15 Sep, 10:30 AM with Dr. Daniel Osei at Northgate Medical Centre, Room 4.",
    sentAt: "09 Sep 2026, 09:06",
    status: "Opened",
  },
  {
    id: "f-2",
    channel: "SMS",
    subject: "Reminder: visit tomorrow at 10:30 AM",
    preview: "Please arrive 10 minutes early and bring your medication list.",
    sentAt: "14 Sep 2026, 08:00",
    status: "Scheduled",
  },
  {
    id: "f-3",
    channel: "Email",
    subject: "Blood pressure recheck due",
    preview: "Dr. Osei recommends a recheck in 2 weeks. Reply to this message to book.",
    sentAt: "28 Aug 2026, 17:20",
    status: "Delivered",
  },
];

export type Notification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "new" | "changed" | "cancelled";
};

export const doctorNotifications: Notification[] = [
  { id: "n-1", title: "New booking — Amina Yusuf", detail: "Tue 16 Sep, 01:00 PM · Chest tightness assessment", time: "12 min ago", kind: "new" },
  { id: "n-2", title: "Rescheduled — Tomas Lindqvist", detail: "Moved from Mon 09:45 AM to Mon 11:15 AM", time: "2 hours ago", kind: "changed" },
  { id: "n-3", title: "Report uploaded — Maya Okonkwo", detail: "ECG_Report_Aug2026.pdf added to her records", time: "Yesterday", kind: "new" },
  { id: "n-4", title: "Cancelled — Ravi Menon", detail: "Fri 19 Sep, 09:30 AM slot is now free", time: "Yesterday", kind: "cancelled" },
];

export type ActivityEntry = { id: string; label: string; detail: string; time: string };

export const activityLog: ActivityEntry[] = [
  { id: "l-1", label: "Appointment booked", detail: "APT-4821 with Dr. Daniel Osei via AI receptionist", time: "09 Sep 2026, 09:06" },
  { id: "l-2", label: "Report uploaded", detail: "ECG_Report_Aug2026.pdf", time: "27 Aug 2026, 15:41" },
  { id: "l-3", label: "Visit completed", detail: "Annual checkup with Dr. Ellen Chen", time: "27 Aug 2026, 09:24" },
  { id: "l-4", label: "Medical history updated", detail: "Added allergy: Pollen", time: "22 Aug 2026, 11:02" },
  { id: "l-5", label: "Appointment cancelled", detail: "APT-4795 with Dr. Lena Sorensen", time: "10 Jul 2026, 18:30" },
];

export const doctorActivityLog: ActivityEntry[] = [
  { id: "dl-1", label: "New booking received", detail: "APT-4833 — Amina Yusuf · Chest tightness assessment", time: "14 Sep 2026, 16:22" },
  { id: "dl-2", label: "Appointment rescheduled", detail: "APT-4822 — Tomas Lindqvist moved to 11:15 AM", time: "14 Sep 2026, 12:05" },
  { id: "dl-3", label: "Patient report reviewed", detail: "ECG_Report_Aug2026.pdf — Maya Okonkwo", time: "13 Sep 2026, 18:40" },
  { id: "dl-4", label: "Visit completed", detail: "APT-4821 prep notes saved for Maya Okonkwo", time: "09 Sep 2026, 10:55" },
  { id: "dl-5", label: "Slot released", detail: "APT cancelled — Ravi Menon · Fri 19 Sep 09:30 AM", time: "13 Sep 2026, 09:12" },
];

export const statusTone: Record<AppointmentStatus, "success" | "warning" | "muted" | "destructive"> = {
  confirmed: "success",
  pending: "warning",
  completed: "muted",
  cancelled: "destructive",
};

export function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
