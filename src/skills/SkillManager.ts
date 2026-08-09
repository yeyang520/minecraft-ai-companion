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

  cancel(requestId: string): void {
    if (!this.current || !this.controller) {
      this.emit("skill.completed", {
        requestId,
        result: {
          skill: "cancel",
          status: "SUCCESS",
          progress: {
            cancelledExecution: false
          }
        }
      });
      return;
    }

    const executionId = this.current.executionId;
    this.current = {
      ...this.current,
      status: "CANCELLING"
    };

    this.controller.abort();

    this.emit("skill.accepted", {
      requestId,
      executionId,
      skill: "cancel"
    });
  }
}
