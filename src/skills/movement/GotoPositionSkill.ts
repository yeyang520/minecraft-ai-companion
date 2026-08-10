import { goals } from "mineflayer-pathfinder";
import type { Skill, SkillContext, SkillResult } from "../Skill";

export interface GotoPositionParams {
  x: number;
  y: number;
  z: number;
  radius?: number;
}

export class GotoPositionSkill implements Skill<GotoPositionParams> {
  readonly name = "goto_position";
  readonly category = "ACTION" as const;

  async execute(
    ctx: SkillContext,
    params: GotoPositionParams,
    signal: AbortSignal
  ): Promise<SkillResult> {
    const startedAt = Date.now();
    const radius = Math.max(0.5, params.radius ?? 1.5);
    const { bot } = ctx;

    try {
      if (signal.aborted) {
        return this.cancelled(startedAt);
      }

      const abortPromise = new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            // Force immediate cancellation of the current pathfinding target.
            bot.pathfinder.setGoal(null);
            reject(new Error("__MAC_CANCELLED__"));
          },
          { once: true }
        );
      });

      const goal = new goals.GoalNear(
        params.x,
        params.y,
        params.z,
        radius
      );

      await Promise.race([
        bot.pathfinder.goto(goal),
        abortPromise
      ]);

      if (signal.aborted) {
        return this.cancelled(startedAt);
      }

      // Deterministic verification:
      // Pathfinder finishing is not enough. Verify real world position.
      const p = bot.entity.position;
      const dx = p.x - params.x;
      const dy = p.y - params.y;
      const dz = p.z - params.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > radius + 0.75) {
        return {
          skill: this.name,
          status: "FAILED",
          reason: "PATH_NOT_FOUND",
          startedAt,
          finishedAt: Date.now(),
          progress: {
            distanceToTarget: Number(distance.toFixed(3)),
            allowedRadius: radius
          }
        };
      }

      return {
        skill: this.name,
        status: "SUCCESS",
        startedAt,
        finishedAt: Date.now(),
        progress: {
          x: Number(p.x.toFixed(3)),
          y: Number(p.y.toFixed(3)),
          z: Number(p.z.toFixed(3)),
          distanceToTarget: Number(distance.toFixed(3))
        }
      };
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.message === "__MAC_CANCELLED__")) {
        return this.cancelled(startedAt);
      }

      console.error("[SKILL goto_position] error:", error);

      return {
        skill: this.name,
        status: "FAILED",
        reason: "PATH_NOT_FOUND",
        startedAt,
        finishedAt: Date.now()
      };
    }
  }

  private cancelled(startedAt: number): SkillResult {
    return {
      skill: this.name,
      status: "CANCELLED",
      reason: "CANCELLED",
      startedAt,
      finishedAt: Date.now()
    };
  }
}
