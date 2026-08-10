import { goals } from "mineflayer-pathfinder";
import type { Skill, SkillContext, SkillResult } from "../Skill";


/* 找到玩家
   ↓
读取位置 P1
   ↓
设置 GoalNear(P1)
   ↓
开始移动
   ↓
每 200ms 看一次
   ↓
玩家还在那里吗？
   │
   ├── 否 → TARGET_LOST
   │
   └── 是
        ↓
现在距离 <= 2？
   │
   ├── 是 → SUCCESS
   │
   └── 否
        ↓
玩家有没有移动 > 1.5 格？
   │
   ├── 是
   │    ↓
   │  更新 Goal
   │
   └── 否
        ↓
       继续
       */

export interface GotoPlayerParams {
  username: string;
  radius?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

export class GotoPlayerSkill implements Skill<GotoPlayerParams> {
  readonly name = "goto_player";
  readonly category = "ACTION" as const;

  async execute(
    ctx: SkillContext,
    params: GotoPlayerParams,
    signal: AbortSignal
  ): Promise<SkillResult> {
    const startedAt = Date.now();

    const { bot } = ctx;

    const radius = Math.max(1, params.radius ?? 2);
    const timeoutMs = Math.max(
      1000,
      params.timeoutMs ?? 60000
    );

    let target = bot.players[params.username]?.entity;

    if (!target) {
      return {
        skill: this.name,
        status: "FAILED",
        reason: "PLAYER_NOT_FOUND",
        startedAt,
        finishedAt: Date.now()
      };
    }

    let lastTargetPosition = target.position.clone();

    this.updateGoal(
      bot,
      lastTargetPosition.x,
      lastTargetPosition.y,
      lastTargetPosition.z,
      radius
    );

    try {
      while (true) {
        // ==============================
        // 1. 外部取消
        // ==============================

        if (signal.aborted) {
          this.stop(bot);

          return {
            skill: this.name,
            status: "CANCELLED",
            reason: "CANCELLED",
            startedAt,
            finishedAt: Date.now()
          };
        }

        // ==============================
        // 2. 超时
        // ==============================

        if (Date.now() - startedAt >= timeoutMs) {
          this.stop(bot);

          return {
            skill: this.name,
            status: "TIMEOUT",
            reason: "TIMEOUT",
            startedAt,
            finishedAt: Date.now()
          };
        }

        // ==============================
        // 3. 重新读取玩家
        // ==============================

        target = bot.players[params.username]?.entity;

        if (!target) {
          this.stop(bot);

          return {
            skill: this.name,
            status: "FAILED",
            reason: "TARGET_LOST",
            startedAt,
            finishedAt: Date.now()
          };
        }

        // ==============================
        // 4. 使用真实距离验证
        // ==============================

        const distance =
          bot.entity.position.distanceTo(
            target.position
          );

        if (distance <= radius) {
          this.stop(bot);

          return {
            skill: this.name,
            status: "SUCCESS",
            startedAt,
            finishedAt: Date.now(),
            progress: {
              username: params.username,
              distanceToPlayer:
                Number(distance.toFixed(3))
            }
          };
        }

        // ==============================
        // 5. 玩家明显移动后更新目标
        // ==============================

        const targetMoved =
          target.position.distanceTo(
            lastTargetPosition
          );

        if (targetMoved >= 1.5) {
          lastTargetPosition =
            target.position.clone();

          this.updateGoal(
            bot,
            lastTargetPosition.x,
            lastTargetPosition.y,
            lastTargetPosition.z,
            radius
          );
        }

        await sleep(200);
      }
    }
    catch (error) {
      this.stop(bot);

      if (signal.aborted) {
        return {
          skill: this.name,
          status: "CANCELLED",
          reason: "CANCELLED",
          startedAt,
          finishedAt: Date.now()
        };
      }

      console.error(
        "[SKILL goto_player] error:",
        error
      );

      return {
        skill: this.name,
        status: "FAILED",
        reason: "PATH_NOT_FOUND",
        startedAt,
        finishedAt: Date.now()
      };
    }
  }

  private updateGoal(
    bot: SkillContext["bot"],
    x: number,
    y: number,
    z: number,
    radius: number
  ): void {
    bot.pathfinder.setGoal(
      new goals.GoalNear(
        Math.floor(x),
        Math.floor(y),
        Math.floor(z),
        Math.ceil(radius)
      )
    );
  }

  private stop(
    bot: SkillContext["bot"]
  ): void {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  }
}