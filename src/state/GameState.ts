export interface Vec3State {
  x: number;
  y: number;
  z: number;
}

export interface InventoryItemState {
  name: string;
  count: number;
  slot: number;
}

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

export interface InventoryState {
  items: InventoryItemState[];
  counts: Record<string, number>;
  emptySlots: number;
  heldItem: string | null;
}

export interface SkillExecutionState {
  executionId: string;
  skill: string;
  status: "RUNNING" | "CANCELLING";
  startedAt: number;
}

export interface GameState {
  timestamp: number;
  connected: boolean;
  bot: BotState | null;
  inventory: InventoryState;
  currentSkill: SkillExecutionState | null;
}
