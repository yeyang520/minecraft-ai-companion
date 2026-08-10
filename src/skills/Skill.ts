import type { Bot } from "mineflayer";

export type SkillCategory =
  | "ACTION"
  | "QUERY";

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

// progress:执行进度
// data:寻找方块信息
export interface SkillResult {
  skill: string;
  status: SkillStatus;
  reason?: SkillFailureReason;
  startedAt: number;
  finishedAt: number;
  progress?: Record<string, number | string | boolean>;
  data?:unknown;
}

export interface SkillContext {
  bot: Bot;
}

export interface Skill<TParams = unknown> {
  readonly name: string;
  readonly category: SkillCategory;

  execute(
    ctx: SkillContext,
    params: TParams,
    signal: AbortSignal
  ): Promise<SkillResult>;
}
