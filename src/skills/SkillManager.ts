import { randomUUID } from "node:crypto";
import type { BotManager } from "../bot/BotManager";
import type { SkillExecutionState } from "../state/GameState";
import type { SkillResult } from "./Skill";
import type { SkillRegistry } from "./SkillRegistry";

export type SkillEventHandler = (
  type: "skill.accepted" | "skill.completed",
  payload: Record<string, unknown>
) => void;

export class SkillManager {
  private controller: AbortController | null = null;
  private current: SkillExecutionState | null = null;

  constructor(
    private readonly botManager: BotManager,
    private readonly registry: SkillRegistry,
    private readonly emit: SkillEventHandler
  ) {}

  getCurrent(): SkillExecutionState | null {
    return this.current ? { ...this.current } : null;
  }

  // requestId:谁发送的命令
  // executionId:执行的skill实例

  // 执行skill
  async execute(
    requestId: string,
    skillName: string,
    params: unknown
  ): Promise<void> {
    if (this.current) {
      this.emit("skill.completed", {
        requestId,
        result: {
          skill: skillName,
          status: "FAILED",
          reason: "BUSY"
        }
      });
      return;
    }

    if (!this.botManager.isReady()) {
      this.emit("skill.completed", {
        requestId,
        result: {
          skill: skillName,
          status: "FAILED",
          reason: "BOT_NOT_READY"
        }
      });
      return;
    }

    const skill = this.registry.get(skillName);

    if (!skill) {
      this.emit("skill.completed", {
        requestId,
        result: {
          skill: skillName,
          status: "FAILED",
          reason: "UNKNOWN_SKILL"
        }
      });
      return;
    }

    const bot = this.botManager.getBot()!;
    const executionId = randomUUID();
    const controller = new AbortController();

    this.controller = controller;
    this.current = {
      executionId,
      skill: skillName,
      status: "RUNNING",
      startedAt: Date.now()
    };

    this.emit("skill.accepted", {
      requestId,
      executionId,
      skill: skillName
    });

    let result: SkillResult;

    try {
      result = await skill.execute(
        { bot },
        params,
        controller.signal
      );
    } catch (error) {
      console.error(`[SKILL ${skillName}] unhandled error:`, error);

      result = {
        skill: skillName,
        status: "FAILED",
        reason: "UNKNOWN",
        startedAt: this.current.startedAt,
        finishedAt: Date.now()
      };
    } finally {
      this.controller = null;
      this.current = null;
    }

    this.emit("skill.completed", {
      requestId,
      executionId,
      result
    });
  }

  // 撤销skill
  cancel(requestId: string): void {
    if (
      !this.current ||!this.controller
    ) {
      this.emit(
        "skill.completed",
        {
          requestId,

          result: {
            skill: "cancel",
            status: "SUCCESS",

            progress: {
              cancelledExecution: false
            }
          }
        }
      );
    return;
    }

    const executionId =
      this.current.executionId;

    // 调用底层stop逻辑
    this.stop();

    this.emit(
      "skill.accepted",
      {
        requestId,
        executionId,
        skill: "cancel"
      }
    );
  }

  // 强制停止
  stop(): {
    stopped: boolean;
    executionId: string | null;
    skill: string | null;
  } {
    const bot =
    this.botManager.getBot();

    const executionId =
      this.current?.executionId ?? null;

    const skill =
      this.current?.skill ?? null;

    // ==============================
    // 1. 通知当前 Skill 中断
    // ==============================

    if (this.current) {
      this.current = {
        ...this.current,
        status: "CANCELLING"
      };
    }

    this.controller?.abort();

    // ==============================
    // 2. 强制停止身体
    // ==============================

    if (bot?.entity) {

      bot.pathfinder.setGoal(null);

      bot.clearControlStates();

      bot.stopDigging();

      bot.deactivateItem();
    }

    return {
      stopped:
        executionId !== null,

      executionId,

      skill
    };
  }
}
