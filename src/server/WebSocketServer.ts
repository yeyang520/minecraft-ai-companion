import { WebSocket, WebSocketServer as WsServer } from "ws";
import type { GameObserver } from "../state/GameObserver";
import type { SkillManager } from "../skills/SkillManager";
import type { SkillRegistry } from "../skills/SkillRegistry";
import type { ClientCommand } from "../protocol/Command";

export class MacWebSocketServer {
  private readonly wss: WsServer;

  constructor(
    host: string,
    port: number,
    private readonly observer: GameObserver,
    private readonly registry: SkillRegistry,
    private readonly skillManager: SkillManager
  ) {
    this.wss = new WsServer({
      host,
      port,
      perMessageDeflate: false
    });

    this.wss.on("listening", () => {
      console.log(`[WS] listening on ws://${host}:${port}`);
    });

    this.wss.on("connection", socket => {
      console.log("[WS] client connected");

      this.send(socket, {
        type: "hello",
        protocol: "mac-v1",
        skills: this.registry.list()
      });

      socket.on("message", raw => {
        this.handleMessage(socket, raw.toString());
      });

      socket.on("close", () => {
        console.log("[WS] client disconnected");
      });
    });
  }

  broadcast(message: unknown): void {
    const text = JSON.stringify(message);

    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    let command: ClientCommand;

    try {
      command = JSON.parse(raw) as ClientCommand;
    } catch {
      this.send(socket, {
        type: "error",
        reason: "INVALID_JSON"
      });
      return;
    }

    if (!command || typeof command.type !== "string") {
      this.send(socket, {
        type: "error",
        reason: "INVALID_COMMAND"
      });
      return;
    }

    switch (command.type) {
      case "state.get":
        this.send(socket, {
          type: "state.snapshot",
          requestId: command.requestId,
          state: this.observer.snapshot()
        });
        return;

      case "skill.list":
        this.send(socket, {
          type: "skill.list",
          requestId: command.requestId,
          skills: this.registry.list()
        });
        return;

      case "skill.execute":
        void this.skillManager.execute(
          command.requestId,
          command.skill,
          command.params ?? {}
        );
        return;

      case "skill.cancel":
        this.skillManager.cancel(command.requestId);
        return;

      default:
        this.send(socket, {
          type: "error",
          requestId: (command as any).requestId,
          reason: "UNKNOWN_COMMAND"
        });
    }
  }

  private send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
