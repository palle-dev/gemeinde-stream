import { AccessToken, LiveKitAPI } from "livekit-server-sdk";

const serverUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!serverUrl || !apiKey || !apiSecret) {
  throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY und LIVEKIT_API_SECRET sind erforderlich");
}

const api = new LiveKitAPI({
  host: serverUrl.replace(/^ws/, "http"),
  apiKey,
  secret: apiSecret,
});

const rooms = await api.room.listRooms();
const token = new AccessToken(apiKey, apiSecret, {
  identity: "smoke-test",
  ttl: "2m",
});
token.addGrant({
  roomJoin: true,
  room: "smoke-test",
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
});
const jwt = await token.toJwt();

console.log(JSON.stringify({
  serverReachable: true,
  roomCount: rooms.length,
  tokenGenerated: jwt.split(".").length === 3,
}));
