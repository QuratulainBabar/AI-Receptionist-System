const DEFAULT_API_URL = "http://localhost:4000";

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || DEFAULT_API_URL;
}

function withApiHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  if (getApiBaseUrl().includes("ngrok")) {
    headers.set("ngrok-skip-browser-warning", "true");
  }
  return headers;
}

export type AuthRole = "patient" | "doctor" | "admin";

export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
  reference: string;
  isActive: boolean;
  createdAt?: string;
};

export type AuthResponse = {
  success: boolean;
  token: string;
  user: ApiUser;
  message?: string;
};

export type AdminStats = {
  doctors: number;
  patients: number;
  activeDoctors: number;
  activePatients: number;
  inactiveDoctors: number;
  inactivePatients: number;
  voiceCalls?: number;
  appointments?: number;
  phoneBookings?: number;
  activeSubscriptions?: number;
};

export type AdminVoiceCall = {
  id: string;
  synthflowCallId: string | null;
  direction: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  callerName: string | null;
  patientId: string | null;
  patientName: string | null;
  patientReference: string | null;
  doctorName: string | null;
  appointmentId: string | null;
  appointmentReference: string | null;
  appointmentStartsAt: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  appointmentReason: string | null;
  appointmentSpecialty: string | null;
  appointmentClinic: string | null;
  appointmentStatus: string | null;
  durationSeconds: number | null;
  summary: string;
  endCallReason: string;
  hasTranscript: boolean;
  hasRecording: boolean;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type AdminVoiceCallDetail = AdminVoiceCall & {
  transcript: string;
  recordingUrl: string | null;
  modelId: string;
  metadata: unknown;
  appointment: {
    id: string;
    reference: string;
    startsAt: string;
    date: string;
    time: string;
    reason: string;
    specialty: string;
    clinic: string;
    status: string;
    doctorName: string;
  } | null;
};

export type ClinicSynthflowSettings = {
  id: string;
  clinicName: string;
  phoneNumber: string;
  synthflowAgentId: string | null;
  agentLanguage: string;
  agentVoiceId: string;
  agentFirstMessage: string;
  agentSystemPrompt: string;
  voiceProvider: string;
  synthflowSyncedAt: string | null;
  synthflowConfigured: boolean;
  webhookUrls: {
    inbound: string;
    data: string;
    bookAction: string;
    availabilityAction: string;
  };
  doctorsCount: number;
  clinicDoctorName: string | null;
  clinicDoctorId: string | null;
};

export type ApiSpecialty = {
  id: string;
  name: string;
  description: string;
  doctors: number;
};

export type ApiDoctor = {
  id: string;
  name: string;
  speciality: string;
  specialityId: string;
  subSpecialty: string;
  qualifications: string[];
  certifications: string[];
  experience: string;
  experienceYears: number;
  rating: number;
  reviews: number;
  clinic: string;
  fee: string;
  consultationType: string;
  languages: string[];
  about: string;
  areasOfExpertise: string[];
  location: string;
  weeklyHoursSummary: string;
  nextAvailable: string;
};

export type ApiWeeklyHourSlot = {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type ApiDoctorProfile = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  reference: string;
  specialtyId: string;
  specialty: string;
  subSpecialty: string;
  qualifications: string[];
  certifications: string[];
  experienceYears: number;
  about: string;
  areasOfExpertise: string[];
  clinic: string;
  fee: string;
  consultationType: string;
  languages: string[];
  location: string;
  weeklyHours: ApiWeeklyHourSlot[];
  weeklyHoursSummary: string;
  timezone?: string;
  rating: number;
  reviews: number;
  isVerified?: boolean;
  verifiedAt?: string | null;
  verificationNote?: string;
};

export type ApiAdminDoctor = ApiUser & {
  specialty: string | null;
  clinic: string | null;
  fee: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanName: string | null;
};

export type ApiBillingCycle = "MONTHLY" | "YEARLY";
export type ApiSubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export type ApiSubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  amountCents: number;
  amountLabel: string;
  currency: string;
  billingCycle: ApiBillingCycle;
  billingCycleLabel: string;
  features: string[];
  stripeProductId: string;
  stripePriceId: string;
  isActive: boolean;
  sortOrder: number;
  trialDays: number;
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiDoctorModule = {
  id: string;
  label: string;
  to: string;
  group: string;
};

export type ApiDoctorAccess = {
  enrolled: boolean;
  profileComplete: boolean;
  availabilityComplete: boolean;
  ready: boolean;
  planName: string | null;
  planFeatures: string[];
  modules: ApiDoctorModule[];
  upcomingModules: ApiDoctorModule[];
  subscription: ApiSubscription | null;
};

export type ApiSubscription = {
  id: string;
  userId: string;
  doctorName: string | null;
  doctorEmail: string | null;
  doctorReference: string | null;
  planId: string;
  planName: string;
  amountCents: number;
  amountLabel: string;
  currency: string;
  billingCycle: ApiBillingCycle;
  billingCycleLabel: string;
  status: ApiSubscriptionStatus;
  statusLabel: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiSubscriptionOverview = {
  stripeConfigured: boolean;
  plans: number;
  activePlans: number;
  active: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  expired: number;
  currentSubscribers: number;
};

export type ApiAdminDoctorSlot = {
  id: string;
  startsAt: string;
  date: string;
  time: string;
  isBooked: boolean;
};

export type ApiAvailabilityDate = {
  id: string;
  label: string;
  month: string;
  slots: number;
};

export type ApiTimeSlot = {
  id: string;
  time: string;
  available: boolean;
  startsAt: string;
};

export type ApiDoctorAvailability = {
  dates: ApiAvailabilityDate[];
  selectedDate: string | null;
  timeSlots: ApiTimeSlot[];
};

export type ApiAppointmentRecordRequest = {
  status: string;
  smsSent: boolean;
  smsError: string;
  expiresAt: string;
  createdAt: string;
  recordsCount: number;
};

export type ApiAppointmentInvoice = {
  status: "pending" | "sent" | "paid" | "failed";
  amountCents: number;
  amountLabel: string;
  currency: string;
  hostedInvoiceUrl: string;
  phone: string;
  smsError: string;
  sentAt: string | null;
  paidAt: string | null;
};

export type ApiAppointment = {
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
  status: "confirmed" | "pending" | "completed" | "cancelled";
  clinic: string;
  fee: string;
  startsAt: string;
  followUpOfId?: string | null;
  followUpOfReference?: string | null;
  isFollowUp?: boolean;
  recordRequest?: ApiAppointmentRecordRequest | null;
  invoice?: ApiAppointmentInvoice | null;
};

export type ApiAdminAppointmentDetail = ApiAppointment & {
  patientEmail: string;
  patientReference: string;
  doctorEmail: string;
  createdAt: string;
  updatedAt: string;
  followUps: Array<{
    id: string;
    reference: string;
    date: string;
    time: string;
    status: string;
  }>;
  voiceCalls: Array<{
    id: string;
    status: string;
    fromNumber: string;
    startedAt: string | null;
    summary: string;
  }>;
};

export type ApiDoctorSlot = {
  id: string;
  startsAt: string;
  startsAtLocal?: string;
  date: string;
  time: string;
  isBooked: boolean;
  appointmentId: string | null;
  appointmentReference: string | null;
  patientName: string | null;
};

export type ApiFollowUpMessage = {
  id: string;
  channel: "Email" | "SMS";
  subject: string;
  preview: string;
  sentAt: string;
  status: "Delivered" | "Scheduled" | "Opened";
  appointmentId?: string;
  appointmentReference?: string;
};

export type ApiMedicalHistory = {
  fullName: string;
  age: number | null;
  bloodGroup: string;
  phone: string;
  symptoms: string;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  updatedAt: string | null;
};

export type ApiMedicalRecord = {
  id: string;
  name: string;
  type: string;
  date: string;
  size: string;
  uploadedBy: string;
  mimeType: string;
  appointmentId?: string | null;
  appointmentReference?: string | null;
  appointmentDate?: string | null;
};

export type ApiRecordGroup = {
  appointmentId: string | null;
  appointmentReference: string | null;
  appointmentDate: string | null;
  label: string;
  uploadDates: Array<{
    date: string;
    records: ApiMedicalRecord[];
  }>;
};

export type ApiRecordRequest = {
  id: string;
  appointmentId: string;
  appointmentReference: string;
  patientName: string;
  doctorName: string;
  phone: string;
  status: string;
  smsSent: boolean;
  smsError: string;
  expiresAt: string;
  createdAt: string;
  uploadUrl: string;
  recordsCount: number;
  message?: string;
};

export type ApiActivity = {
  id: string;
  label: string;
  detail: string;
  time: string;
  type: string;
};

export type ApiDashboardFollowUpDue = {
  value: string;
  detail: string;
};

export type ApiDashboardNextAppointment = {
  value: string;
  detail: string;
  appointment: ApiAppointment;
};

export type ApiPatientDashboard = {
  patientName: string;
  nextAppointment: ApiDashboardNextAppointment | null;
  followUpDue: ApiDashboardFollowUpDue | null;
  unreadMessages: number;
  recordsCount: number;
  upcomingAppointments: ApiAppointment[];
  popularSpecialties: ApiSpecialty[];
  recentActivity: ApiActivity[];
};

type ApiErrorBody = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[] | undefined>;

  constructor(status: number, message: string, errors?: Record<string, string[] | undefined>) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.name = "ApiError";
  }
}

export function formatApiError(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    if (err.errors) {
      const parts = Object.entries(err.errors).flatMap(([field, messages]) =>
        (messages ?? []).map((message) => `${field}: ${message}`),
      );
      if (parts.length) return parts.join(" · ");
    }
    return err.message || fallback;
  }
  if (err instanceof TypeError) {
    return "Cannot reach the API. Make sure the backend is running on http://localhost:4000.";
  }
  return fallback;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = withApiHeaders(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, "Cannot reach the API. Make sure the backend is running on http://localhost:4000.");
    }
    throw error;
  }

  let body: ApiErrorBody & T;
  try {
    body = (await response.json()) as ApiErrorBody & T;
  } catch {
    throw new ApiError(response.status, "Unexpected server response");
  }

  if (!response.ok) {
    throw new ApiError(response.status, body.message || "Request failed", body.errors);
  }

  return body;
}

function authHeader() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ai-receptionist-token");
}

export const authApi = {
  signup(payload: { fullName: string; email: string; password: string; role: "patient" | "doctor" }) {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(payload: { email: string; password: string }) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminLogin(payload: { email: string; password: string }) {
    return request<AuthResponse>("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  forgotPassword(payload: { email: string }) {
    return request<{
      success: boolean;
      message: string;
      resetToken?: string;
      resetUrl?: string;
    }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  resetPassword(payload: { token: string; password: string }) {
    return request<{ success: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  me(token: string) {
    return request<{ success: boolean; user: ApiUser }>("/api/auth/me", { method: "GET" }, token);
  },
};

export const adminApi = {
  stats() {
    return request<{ success: boolean; stats: AdminStats }>("/api/admin/stats", { method: "GET" }, authHeader());
  },
  listVoiceCalls(params?: { q?: string; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<{ success: boolean; calls: AdminVoiceCall[] }>(
      `/api/admin/voice-calls${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  getVoiceCall(callId: string) {
    return request<{ success: boolean; call: AdminVoiceCallDetail }>(
      `/api/admin/voice-calls/${encodeURIComponent(callId)}`,
      { method: "GET" },
      authHeader(),
    );
  },
  async getVoiceCallRecordingObjectUrl(callId: string) {
    const token = authHeader();
    const headers = withApiHeaders();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(
      `${getApiBaseUrl()}/api/admin/voice-calls/${encodeURIComponent(callId)}/recording`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      let message = "Unable to load call recording";
      try {
        const body = (await response.json()) as { message?: string };
        message = body.message || message;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  listAppointments(params?: { q?: string; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<{ success: boolean; appointments: ApiAppointment[] }>(
      `/api/admin/appointments${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  getAppointment(appointmentId: string) {
    return request<{ success: boolean; appointment: ApiAdminAppointmentDetail }>(
      `/api/admin/appointments/${appointmentId}`,
      { method: "GET" },
      authHeader(),
    );
  },
  updateAppointmentStatus(appointmentId: string, status: ApiAppointment["status"]) {
    return request<{ success: boolean; appointment: ApiAppointment; message?: string }>(
      `/api/admin/appointments/${appointmentId}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      authHeader(),
    );
  },
  rescheduleAppointment(appointmentId: string, slotId: string) {
    return request<{ success: boolean; appointment: ApiAppointment; message?: string }>(
      `/api/admin/appointments/${appointmentId}/reschedule`,
      { method: "POST", body: JSON.stringify({ slotId }) },
      authHeader(),
    );
  },
  listDoctorOpenSlots(userId: string) {
    return request<{ success: boolean; slots: ApiAdminDoctorSlot[] }>(
      `/api/admin/doctors/${userId}/slots`,
      { method: "GET" },
      authHeader(),
    );
  },
  generateDoctorSlots(userId: string, weeks = 2) {
    return request<{
      success: boolean;
      created: number;
      considered: number;
      weeks: number;
      message?: string;
    }>(
      `/api/admin/doctors/${userId}/slots/generate`,
      { method: "POST", body: JSON.stringify({ weeks }) },
      authHeader(),
    );
  },
  listDoctors(params?: {
    q?: string;
    status?: "active" | "inactive" | "all";
    verification?: "verified" | "unverified" | "all";
  }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.status) search.set("status", params.status);
    if (params?.verification) search.set("verification", params.verification);
    const qs = search.toString();
    return request<{ success: boolean; users: ApiAdminDoctor[] }>(
      `/api/admin/doctors${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  getDoctorCrm(userId: string) {
    return request<{
      success: boolean;
      user: ApiUser;
      profile: ApiDoctorProfile | null;
      subscription: ApiSubscription | null;
    }>(
      `/api/admin/doctors/${userId}/crm`,
      { method: "GET" },
      authHeader(),
    );
  },
  updateDoctorCrm(
    userId: string,
    body: Partial<{
      specialtyId: string;
      subSpecialty: string;
      qualifications: string[];
      certifications: string[];
      experienceYears: number;
      about: string;
      areasOfExpertise: string[];
      clinic: string;
      fee: string;
      consultationType: string;
      languages: string[];
      location: string;
      weeklyHours: ApiWeeklyHourSlot[];
    }>,
  ) {
    return request<{
      success: boolean;
      user: ApiUser;
      profile: ApiDoctorProfile | null;
      message?: string;
    }>(
      `/api/admin/doctors/${userId}/crm`,
      { method: "PUT", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  setDoctorVerification(userId: string, isVerified: boolean, verificationNote?: string) {
    return request<{
      success: boolean;
      user: ApiUser;
      profile: ApiDoctorProfile | null;
      message?: string;
    }>(
      `/api/admin/doctors/${userId}/verification`,
      {
        method: "PATCH",
        body: JSON.stringify({ isVerified, verificationNote }),
      },
      authHeader(),
    );
  },
  listPatients(params?: { q?: string; status?: "active" | "inactive" | "all" }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.status) search.set("status", params.status);
    const qs = search.toString();
    return request<{ success: boolean; users: ApiUser[] }>(
      `/api/admin/patients${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  getUser(userId: string) {
    return request<{ success: boolean; user: ApiUser }>(`/api/admin/users/${userId}`, { method: "GET" }, authHeader());
  },
  setStatus(userId: string, isActive: boolean) {
    return request<{ success: boolean; user: ApiUser }>(
      `/api/admin/users/${userId}/status`,
      { method: "PATCH", body: JSON.stringify({ isActive }) },
      authHeader(),
    );
  },
  subscriptionOverview() {
    return request<{ success: boolean; overview: ApiSubscriptionOverview }>(
      "/api/admin/subscriptions/overview",
      { method: "GET" },
      authHeader(),
    );
  },
  listSubscriptionPlans() {
    return request<{ success: boolean; plans: ApiSubscriptionPlan[] }>(
      "/api/admin/subscriptions/plans",
      { method: "GET" },
      authHeader(),
    );
  },
  createSubscriptionPlan(body: {
    name: string;
    description?: string;
    amountCents: number;
    currency?: string;
    billingCycle: ApiBillingCycle;
    features: string[];
    isActive?: boolean;
    sortOrder?: number;
    trialDays?: number;
  }) {
    return request<{ success: boolean; plan: ApiSubscriptionPlan; message?: string }>(
      "/api/admin/subscriptions/plans",
      { method: "POST", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  updateSubscriptionPlan(
    planId: string,
    body: Partial<{
      name: string;
      description: string;
      amountCents: number;
      currency: string;
      billingCycle: ApiBillingCycle;
      features: string[];
      isActive: boolean;
      sortOrder: number;
      trialDays: number;
    }>,
  ) {
    return request<{ success: boolean; plan: ApiSubscriptionPlan; message?: string }>(
      `/api/admin/subscriptions/plans/${planId}`,
      { method: "PUT", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  setSubscriptionPlanActive(planId: string, isActive: boolean) {
    return request<{ success: boolean; plan: ApiSubscriptionPlan; message?: string }>(
      `/api/admin/subscriptions/plans/${planId}/status`,
      { method: "PATCH", body: JSON.stringify({ isActive }) },
      authHeader(),
    );
  },
  listSubscriptions(params?: { q?: string; status?: string; planId?: string }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.status) search.set("status", params.status);
    if (params?.planId) search.set("planId", params.planId);
    const qs = search.toString();
    return request<{ success: boolean; subscriptions: ApiSubscription[] }>(
      `/api/admin/subscriptions${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  assignSubscription(userId: string, planId: string) {
    return request<{ success: boolean; subscription: ApiSubscription; message?: string }>(
      "/api/admin/subscriptions/assign",
      { method: "POST", body: JSON.stringify({ userId, planId }) },
      authHeader(),
    );
  },
  getSynthflow() {
    return request<{ success: boolean; settings: ClinicSynthflowSettings }>(
      "/api/admin/synthflow",
      { method: "GET" },
      authHeader(),
    );
  },
  updateSynthflow(body: Partial<ClinicSynthflowSettings>) {
    return request<{ success: boolean; settings: ClinicSynthflowSettings }>(
      "/api/admin/synthflow",
      { method: "PUT", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  createOrUpdateSynthflowAgent(body?: {
    firstMessage?: string;
    systemPrompt?: string;
    phoneNumber?: string;
    language?: string;
    voiceId?: string;
    synthflowAgentId?: string;
  }) {
    return request<{
      success: boolean;
      action: string;
      synthflowAgentId: string;
      phoneNumber: string | null;
      doctorsCount: number;
      clinicDoctorName: string | null;
      clinicDoctorId: string | null;
      warning: string | null;
      settings: ClinicSynthflowSettings;
    }>("/api/admin/synthflow/agent", { method: "POST", body: JSON.stringify(body ?? {}) }, authHeader());
  },
  syncSynthflowDirectory() {
    return request<{
      success: boolean;
      action: string;
      synthflowAgentId: string;
      doctorsCount: number;
      clinicDoctorName: string | null;
      clinicDoctorId: string | null;
      warning: string | null;
      settings: ClinicSynthflowSettings;
    }>("/api/admin/synthflow/sync", { method: "POST", body: JSON.stringify({}) }, authHeader());
  },
};

export const doctorsApi = {
  listSpecialties() {
    return request<{ success: boolean; specialties: ApiSpecialty[] }>(
      "/api/doctors/specialties",
      { method: "GET" },
      authHeader(),
    );
  },
  list(params?: { q?: string; specialtyId?: string }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.specialtyId) search.set("specialtyId", params.specialtyId);
    const qs = search.toString();
    return request<{ success: boolean; doctors: ApiDoctor[] }>(
      `/api/doctors${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  get(doctorId: string) {
    return request<{ success: boolean; doctor: ApiDoctor }>(
      `/api/doctors/${doctorId}`,
      { method: "GET" },
      authHeader(),
    );
  },
  availability(doctorId: string, date?: string) {
    const search = new URLSearchParams();
    if (date) search.set("date", date);
    const qs = search.toString();
    return request<{ success: boolean; availability: ApiDoctorAvailability }>(
      `/api/doctors/${doctorId}/availability${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
};

export const appointmentsApi = {
  create(payload: { doctorId: string; slotId: string; reason?: string }) {
    return request<{ success: boolean; appointment: ApiAppointment }>(
      "/api/appointments",
      { method: "POST", body: JSON.stringify(payload) },
      authHeader(),
    );
  },
  list() {
    return request<{ success: boolean; appointments: ApiAppointment[] }>(
      "/api/appointments",
      { method: "GET" },
      authHeader(),
    );
  },
  get(appointmentId: string) {
    return request<{ success: boolean; appointment: ApiAppointment }>(
      `/api/appointments/${appointmentId}`,
      { method: "GET" },
      authHeader(),
    );
  },
};

export const doctorAppointmentsApi = {
  list() {
    return request<{ success: boolean; appointments: ApiAppointment[] }>(
      "/api/doctor/appointments",
      { method: "GET" },
      authHeader(),
    );
  },
  get(appointmentId: string) {
    return request<{ success: boolean; appointment: ApiAppointment }>(
      `/api/doctor/appointments/${appointmentId}`,
      { method: "GET" },
      authHeader(),
    );
  },
  updateStatus(appointmentId: string, status: ApiAppointment["status"]) {
    return request<{ success: boolean; appointment: ApiAppointment; message?: string }>(
      `/api/doctor/appointments/${appointmentId}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      authHeader(),
    );
  },
  scheduleFollowUp(
    appointmentId: string,
    body: { slotId: string; reason?: string; mode?: ApiAppointment["mode"] },
  ) {
    return request<{ success: boolean; appointment: ApiAppointment; message?: string }>(
      `/api/doctor/appointments/${appointmentId}/follow-up`,
      { method: "POST", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  requestRecords(appointmentId: string) {
    return request<{ success: boolean; request: ApiRecordRequest; message?: string }>(
      `/api/doctor/appointments/${appointmentId}/record-request`,
      { method: "POST" },
      authHeader(),
    );
  },
  sendInvoice(appointmentId: string) {
    return request<{
      success: boolean;
      appointment: ApiAppointment;
      message?: string;
      paymentUrl?: string;
    }>(
      `/api/doctor/appointments/${appointmentId}/invoice`,
      { method: "POST" },
      authHeader(),
    );
  },
};

export const doctorAvailabilityApi = {
  list(params?: { from?: string; to?: string; includeBooked?: boolean }) {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    if (params?.includeBooked === false) search.set("includeBooked", "false");
    const qs = search.toString();
    return request<{
      success: boolean;
      slots: ApiDoctorSlot[];
      clinicTimeZone?: string;
      clinicTimeZoneLabel?: string;
    }>(
      `/api/doctor/availability${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  create(startsAt: string) {
    return request<{ success: boolean; slot: ApiDoctorSlot; message?: string }>(
      "/api/doctor/availability",
      { method: "POST", body: JSON.stringify({ startsAt }) },
      authHeader(),
    );
  },
  update(slotId: string, startsAt: string) {
    return request<{ success: boolean; slot: ApiDoctorSlot; message?: string }>(
      `/api/doctor/availability/${slotId}`,
      { method: "PUT", body: JSON.stringify({ startsAt }) },
      authHeader(),
    );
  },
  remove(slotId: string) {
    return request<{ success: boolean; id: string; message?: string }>(
      `/api/doctor/availability/${slotId}`,
      { method: "DELETE" },
      authHeader(),
    );
  },
  generate(weeks = 2) {
    return request<{
      success: boolean;
      created: number;
      considered: number;
      weeks: number;
      message?: string;
    }>(
      "/api/doctor/availability/generate",
      { method: "POST", body: JSON.stringify({ weeks }) },
      authHeader(),
    );
  },
};

export type ApiDoctorNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "new" | "changed" | "cancelled";
};

export const doctorNotificationsApi = {
  list() {
    return request<{ success: boolean; notifications: ApiDoctorNotification[] }>(
      "/api/doctor/notifications",
      { method: "GET" },
      authHeader(),
    );
  },
};

export const doctorActivityApi = {
  list() {
    return request<{ success: boolean; activities: ApiActivity[] }>(
      "/api/doctor/activity",
      { method: "GET" },
      authHeader(),
    );
  },
};

export type ApiDoctorDashboard = {
  doctorName: string;
  speciality: string;
  clinic: string;
  todayVisitsCount: number;
  awaitingConfirmCount: number;
  unreadAlerts: number;
  patientsCount: number;
  todayAppointments: ApiAppointment[];
  latestNotifications: ApiDoctorNotification[];
  subscription: ApiSubscription | null;
};

export const doctorSubscriptionApi = {
  listPlans() {
    return request<{ success: boolean; plans: ApiSubscriptionPlan[]; stripeConfigured: boolean }>(
      "/api/doctor/subscription/plans",
      { method: "GET" },
      authHeader(),
    );
  },
  getMine() {
    return request<{ success: boolean; subscription: ApiSubscription | null; stripeConfigured: boolean }>(
      "/api/doctor/subscription",
      { method: "GET" },
      authHeader(),
    );
  },
  checkout(planId: string, returnOrigin?: string) {
    return request<{ success: boolean; checkout: { url: string; sessionId: string } }>(
      "/api/doctor/subscription/checkout",
      { method: "POST", body: JSON.stringify({ planId, returnOrigin }) },
      authHeader(),
    );
  },
  access() {
    return request<{ success: boolean; access: ApiDoctorAccess }>("/api/doctor/subscription/access", { method: "GET" }, authHeader());
  },
  confirm(sessionId: string) {
    return request<{ success: boolean; enrolled: boolean; access: ApiDoctorAccess }>(
      "/api/doctor/subscription/checkout/confirm",
      { method: "POST", body: JSON.stringify({ sessionId }) },
      authHeader(),
    );
  },
};

export const doctorDashboardApi = {
  get() {
    return request<{ success: boolean; dashboard: ApiDoctorDashboard }>(
      "/api/doctor/dashboard",
      { method: "GET" },
      authHeader(),
    );
  },
};

export const doctorProfileApi = {
  get() {
    return request<{ success: boolean; profile: ApiDoctorProfile }>(
      "/api/doctor/profile",
      { method: "GET" },
      authHeader(),
    );
  },
  update(body: {
    specialtyId?: string;
    specialty?: string;
    subSpecialty?: string;
    qualifications?: string[];
    certifications?: string[];
    experienceYears?: number;
    about?: string;
    areasOfExpertise?: string[];
    clinic?: string;
    fee?: string;
    consultationType?: string;
    languages?: string[];
    location?: string;
    weeklyHours?: ApiWeeklyHourSlot[];
  }) {
    return request<{ success: boolean; profile: ApiDoctorProfile; message?: string }>(
      "/api/doctor/profile",
      { method: "PUT", body: JSON.stringify(body) },
      authHeader(),
    );
  },
};

export type ApiDoctorPatient = {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  reference: string;
  lastVisit: string;
  condition: string;
  phone: string;
  isActive: boolean;
};

export type ApiPatientTimelineEvent = {
  id: string;
  kind: "visit" | "follow_up" | "status" | "report" | "prescription" | "note" | "transcription";
  occurredAt: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  detail: string;
  appointmentId: string | null;
  appointmentReference: string | null;
  status: string | null;
  recordId: string | null;
};

export type ApiDoctorPatientFile = {
  patient: ApiDoctorPatient;
  appointments: ApiAppointment[];
  history: ApiMedicalHistory;
  records: ApiMedicalRecord[];
  recordGroups: ApiRecordGroup[];
  timeline?: ApiPatientTimelineEvent[];
};

export const doctorPatientsApi = {
  list(params?: { q?: string }) {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    const qs = search.toString();
    return request<{ success: boolean; patients: ApiDoctorPatient[] }>(
      `/api/doctor/patients${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      authHeader(),
    );
  },
  get(patientId: string) {
    return request<{ success: boolean; message?: string } & ApiDoctorPatientFile>(
      `/api/doctor/patients/${patientId}`,
      { method: "GET" },
      authHeader(),
    );
  },
  addNote(patientId: string, body: { body: string; appointmentId?: string }) {
    return request<{ success: boolean; message?: string } & ApiDoctorPatientFile>(
      `/api/doctor/patients/${patientId}/notes`,
      { method: "POST", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  addPrescription(
    patientId: string,
    body: { medication: string; dosage?: string; instructions?: string; appointmentId?: string },
  ) {
    return request<{ success: boolean; message?: string } & ApiDoctorPatientFile>(
      `/api/doctor/patients/${patientId}/prescriptions`,
      { method: "POST", body: JSON.stringify(body) },
      authHeader(),
    );
  },
  requestRecords(appointmentId: string) {
    return request<{ success: boolean; request: ApiRecordRequest; message?: string }>(
      `/api/doctor/appointments/${appointmentId}/record-request`,
      { method: "POST" },
      authHeader(),
    );
  },
  async openRecordFile(patientId: string, recordId: string) {
    const token = authHeader();
    const headers = withApiHeaders();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(
      `${getApiBaseUrl()}/api/doctor/patients/${patientId}/records/${recordId}/file`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      let message = "Unable to open file";
      try {
        const body = (await response.json()) as { message?: string };
        message = body.message || message;
      } catch {
        // ignore
      }
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

export const messagesApi = {
  list() {
    return request<{ success: boolean; messages: ApiFollowUpMessage[] }>(
      "/api/messages",
      { method: "GET" },
      authHeader(),
    );
  },
};

export const medicalHistoryApi = {
  get() {
    return request<{ success: boolean; history: ApiMedicalHistory }>(
      "/api/patient/medical-history",
      { method: "GET" },
      authHeader(),
    );
  },
  save(payload: Omit<ApiMedicalHistory, "updatedAt">) {
    return request<{ success: boolean; history: ApiMedicalHistory; message?: string }>(
      "/api/patient/medical-history",
      { method: "PUT", body: JSON.stringify(payload) },
      authHeader(),
    );
  },
};

export const recordsApi = {
  list() {
    return request<{ success: boolean; records: ApiMedicalRecord[] }>(
      "/api/patient/records",
      { method: "GET" },
      authHeader(),
    );
  },
  async upload(file: File, category?: string) {
    const form = new FormData();
    form.append("file", file);
    if (category) form.append("category", category);

    const token = authHeader();
    const headers = withApiHeaders();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${getApiBaseUrl()}/api/patient/records`, {
        method: "POST",
        headers,
        body: form,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiError(0, "Cannot reach the API. Make sure the backend is running on http://localhost:4000.");
      }
      throw error;
    }

    const body = (await response.json()) as {
      success?: boolean;
      message?: string;
      record?: ApiMedicalRecord;
      errors?: Record<string, string[] | undefined>;
    };

    if (!response.ok || !body.record) {
      throw new ApiError(response.status, body.message || "Upload failed", body.errors);
    }

    return { success: true as const, record: body.record, message: body.message };
  },
  async openFile(recordId: string) {
    const token = authHeader();
    const headers = withApiHeaders();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${getApiBaseUrl()}/api/patient/records/${recordId}/file`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      let message = "Unable to open file";
      try {
        const body = (await response.json()) as { message?: string };
        message = body.message || message;
      } catch {
        // ignore
      }
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

export const activityApi = {
  list() {
    return request<{ success: boolean; activities: ApiActivity[] }>(
      "/api/patient/activity",
      { method: "GET" },
      authHeader(),
    );
  },
};

export const dashboardApi = {
  get() {
    return request<{ success: boolean; dashboard: ApiPatientDashboard }>(
      "/api/patient/dashboard",
      { method: "GET" },
      authHeader(),
    );
  },
};
