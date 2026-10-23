/** Soft hospital-appropriate chime for new appointment notifications (Web Audio). */

const ANNOUNCED_KEY = "ai-receptionist-announced-notif-ids";

let audioCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Resume AudioContext after a user gesture (browser autoplay policy). */
export function unlockNotificationAudio() {
  if (unlockBound) return;
  unlockBound = true;
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => {
    /* autoplay still blocked — ignore */
  });
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gainPeak: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Short two-note chime; no-ops if audio is locked or unavailable. */
export function playNewAppointmentChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    if (ctx.state !== "running") return;

    const t0 = ctx.currentTime + 0.01;
    tone(ctx, 784, t0, 0.22, 0.045); // G5
    tone(ctx, 988, t0 + 0.14, 0.28, 0.038); // B5
  } catch {
    /* ignore */
  }
}

function readAnnouncedIds(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ANNOUNCED_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeAnnouncedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Returns booking notification ids that have not been announced yet this tab session.
 * First call bootstraps silently so historical unread items do not chime on load.
 */
export function takeFreshBookingAnnouncementIds(bookingNotificationIds: string[]): string[] {
  const announced = readAnnouncedIds();
  if (announced == null) {
    writeAnnouncedIds(new Set(bookingNotificationIds));
    return [];
  }

  const fresh = bookingNotificationIds.filter((id) => !announced.has(id));
  for (const id of bookingNotificationIds) announced.add(id);
  writeAnnouncedIds(announced);
  return fresh;
}

export function isNewAppointmentNotification(note: {
  eventType?: string;
  kind?: string;
  title?: string;
}): boolean {
  if (note.eventType === "booking") return true;
  // Fallback if older API payloads omit eventType
  return (
    note.kind === "new" &&
    typeof note.title === "string" &&
    (/^New booking/i.test(note.title) || /^Booking pending/i.test(note.title))
  );
}
