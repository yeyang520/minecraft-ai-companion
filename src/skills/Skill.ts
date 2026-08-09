import type { Bot } from "mineflayer";

export type SkillStatus =
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export type SkillFailureReason =
  | "BOT_NOT_READY"
  | "PATH_NOT_FOUND"
  | "PLAYER_NOT_FOUND"
  | "TARGET_LOST"
  | "CANCELLED"
  | "TIMEOUT"
  | "UNKNOWN";

export interface SkillResult {
  skill: string;
  status: SkillStatus;
  reason?: SkillFailureReason;
  startedAt: number;
  finishedAt: number;
  progress?: Record<string, number | string | boolean>;
}

export interface SkillContext {
  bot: Bot;
}

export interface Skill<TParams = unknown> {
  readonly name: string;

  execute(
    ctx: SkillContext,
    params: TParams,
    signal: AbortSignal
  ): Promise<SkillResult>;
}
