import type { Bot } from "mineflayer";
import type { GameState, InventoryState, SkillExecutionState } from "./GameState";

export class GameObserver {
  constructor(
    private readonly getBot: () => Bot | null,
    private readonly getCurrentSkill: () => SkillExecutionState | null
  ) {}

  snapshot(): GameState {
    const bot = this.getBot();

    // ==========================================
    // Bot 尚未完全进入世界
    // ==========================================
    if (
      !bot ||
      !this.botManager.isReady() ||
      !bot.entity ||
      !bot.inventory
    ) {

      return {
        timestamp:
          Date.now(),
        connected:
          false,
        bot:
          null,
        inventory: {
          items: [],
          heldItem: null,
          occupiedSlots: 0,
          freeSlots: 36,
          isFull: false
        },
        currentSkill:
          this.skillManager.getCurrentSkill()
      };
    }

    // ==========================================
    // 到这里才允许访问 inventory
    // ==========================================
    const inventoryItems = bot.inventory.items();

    const occupiedSlots = inventoryItems.length;

    const totalSlots = 36;

    const freeSlots = Math.max(0,totalSlots - occupiedSlots);

    if (!bot?.entity) {
      return {
        timestamp: Date.now(),
        connected: false,
        bot: null,
        inventory: {
          items: [],
          counts: {},
          emptySlots: 36,
          heldItem: null
        },
        currentSkill: this.getCurrentSkill()
      };
    }

    const items = bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      slot: item.slot
    }));

    const counts: Record<string, number> = {};
    for (const item of items) counts[item.name] = (counts[item.name] ?? 0) + item.count;

    const inventory: InventoryState = {
      items,
      counts,
      emptySlots: Math.max(0, 36 - items.length),
      heldItem: bot.heldItem?.name ?? null
    };

    const pos = bot.entity.position;

    return {
      timestamp: Date.now(),
      connected: true,
      bot: {
        username: bot.username,
        position: {
          x: pos.x,
          y: pos.y,
          z: pos.z
        },
        yaw: bot.entity.yaw,
        pitch: bot.entity.pitch,
        health: bot.health,
        food: bot.food,
        dimension: bot.game.dimension,
        isAlive: bot.health > 0,
        isOnGround: bot.entity.onGround,
        isInWater: bot.entity.isInWater
      },
      inventory:{
          items,
          heldItem:
            bot.heldItem?.name ?? null,
          occupiedSlots,
          freeSlots,
          isFull:
            freeSlots === 0
      },
      currentSkill: this.getCurrentSkill()
    };
  }
}
