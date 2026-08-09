import mineflayer, { type Bot } from "mineflayer";
import { pathfinder, Movements } from "mineflayer-pathfinder";
import { config } from "../config";

export class BotManager {
  private bot: Bot | null = null;
  private ready = false;

  connect(): Bot {
    if (this.bot) return this.bot;

    console.log(
      `[BOT] connecting to ${config.minecraft.host}:${config.minecraft.port} as ${config.minecraft.username}`
    );

    const bot = mineflayer.createBot({
      host: config.minecraft.host,
      port: config.minecraft.port,
      username: config.minecraft.username,
      auth: config.minecraft.auth
    });

    bot.loadPlugin(pathfinder);

    bot.once("spawn", () => {
      const movements = new Movements(bot);

      // Phase 1: keep navigation conservative.
      // We do not want goto_position to modify the world yet.
      movements.canDig = false;
      movements.allow1by1towers = false;

      bot.pathfinder.setMovements(movements);
      this.ready = true;

      const p = bot.entity.position;
      console.log(
        `[BOT] spawned at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`
      );
    });

    bot.on("kicked", reason => {
      this.ready = false;
      console.error("[BOT] kicked:", reason);
    });

    bot.on("error", error => {
      console.error("[BOT] error:", error);
    });

    bot.on("end", reason => {
      this.ready = false;
      console.warn("[BOT] disconnected:", reason);
    });

    bot.on("death", () => {
      console.warn("[BOT] died");
    });

    this.bot = bot;
    return bot;
  }

  getBot(): Bot | null {
    return this.bot;
  }

  isReady(): boolean {
    return this.ready && !!this.bot?.entity;
  }
}
