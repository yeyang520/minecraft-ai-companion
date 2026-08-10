// 位置
export interface Vec3State {
  x: number;
  y: number;
  z: number;
}

// 单个物品状态
export interface InventoryItemState {
  name: string;
  count: number;
  slot: number;
}

// 机器人状态
export interface BotState {
  username: string;
  position: Vec3State;
  yaw: number;
  pitch: number;
  health: number;
  food: number;
  dimension: string;
  isAlive: boolean;
  isOnGround: boolean;
  isInWater: boolean;
}

// 物品状态
export interface InventoryState {
  items: InventoryItemState[];
  counts: Record<string, number>;
  emptySlots: number;
  heldItem: string | null;
}

// skill执行状态
export interface SkillExecutionState {
  executionId: string;
  skill: string;
  status: "RUNNING" | "CANCELLING";
  startedAt: number;
}

// 游戏状态
export interface GameState {
  timestamp: number;
  connected: boolean;
  bot: BotState | null;
  inventory: InventoryState;
  currentSkill: SkillExecutionState | null;
}
