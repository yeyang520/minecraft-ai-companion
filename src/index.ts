import { config } from "./config";
import { BotManager } from "./bot/BotManager";
import { GameObserver } from "./state/GameObserver";
import { SkillRegistry } from "./skills/SkillRegistry";
import { SkillManager } from "./skills/SkillManager";
import { MacWebSocketServer } from "./server/WebSocketServer";

console.log("[MAC] starting...");

const botManager = new BotManager();
const registry = new SkillRegistry();

let server: MacWebSocketServer;

const skillManager = new SkillManager(
  botManager,
  registry,
  (type, payload) => {
    server?.broadcast({
      type,
      ...payload
    });
  }
);

const observer = new GameObserver(
  () => botManager.getBot(),
  () => skillManager.getCurrent()
);

server = new MacWebSocketServer(
  config.websocket.host,
  config.websocket.port,
  observer,
  registry,
  skillManager
);

// Low-frequency world state stream.
// Important events will be event-driven in the next milestone.
const intervalMs = Math.max(
  100,
  Math.round(1000 / config.state.broadcastHz)
);

setInterval(() => {
  server.broadcast({
    type: "state.snapshot",
    state: observer.snapshot()
  });
}, intervalMs);

botManager.connect();

process.on("SIGINT", () => {
  console.log("\n[MAC] shutting down...");
  skillManager.cancel("system-shutdown");
  botManager.getBot()?.quit("MAC shutdown");
  process.exit(0);
});
