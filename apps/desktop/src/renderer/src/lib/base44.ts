import { createClient } from "@base44/sdk";

const appId = import.meta.env.VITE_BASE44_APP_ID || "6ade1b54b52f50b9ad06e6ae";

export const base44 = createClient({ appId });
