export type RoomMode = "meeting" | "broadcast";
export type RoomStatus = "scheduled" | "live" | "ended";

export interface UserInfo {
  id: string;
  email: string;
  full_name?: string;
}

export interface EventRecord {
  id: string;
  title: string;
  description?: string;
  mode: RoomMode;
  status: RoomStatus;
  starts_at?: string;
  host_email: string;
  join_code: string;
  livekit_room_name: string;
  default_camera_on?: boolean;
  default_microphone_on?: boolean;
  created_date?: string;
}

export interface MembershipRecord {
  id: string;
  event_id: string;
  event_title: string;
  event_mode: RoomMode;
  user_email: string;
  display_name: string;
  role: "host" | "cohost" | "operator" | "speaker" | "participant" | "viewer";
}

export function createJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function createLiveKitRoomName(): string {
  return `gemeinde-${crypto.randomUUID()}`;
}
