import "@base44/sdk";

declare module "@base44/sdk" {
  interface FunctionNameRegistry {
    "create-livekit-token": true;
    "get-room": true;
    "join-room": true;
    "manage-room-member": true;
    "manage-broadcast-scenes": true;
    "manage-event": true;
    "manage-rundown": true;
  }
}
