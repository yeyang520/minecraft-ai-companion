export type AuthMode = "offline" | "microsoft";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  minecraft: {
    host: process.env.MC_HOST ?? "127.0.0.1",
    port: numberFromEnv("MC_PORT", 25565),
    username: process.env.MC_USERNAME ?? "MAC_Bot",
    auth: (process.env.MC_AUTH ?? "offline") as AuthMode
  },

  websocket: {
    host: "127.0.0.1",
    port: numberFromEnv("WS_PORT", 8765)
  },

  state: {
    broadcastHz: 2
  }
};
