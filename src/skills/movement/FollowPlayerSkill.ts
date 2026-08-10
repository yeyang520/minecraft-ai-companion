import { goals } from "mineflayer-pathfinder";
import type { Skill, SkillContext, SkillResult } from "../Skill";

export interface FollowPlayerParams {
  username: string;

  // 正常停留距离
  distance?: number;

  // 玩家消失多久才真正判定丢失
  lostTimeoutMs?: number;
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

export class FollowPlayerSkill
  implements Skill<FollowPlayerParams> {

  readonly name = "follow_player";
  readonly category = "ACTION" as const;

  async execute(
    ctx: SkillContext,
    params: FollowPlayerParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt = Date.now();
    const { bot } = ctx;

    const followDistance =
      Math.max(1, params.distance ?? 2);

    const resumeDistance =
      followDistance + 1.5;

    // 消失超过2s才任务失败
    const lostTimeoutMs =
      Math.max(
        500,
        params.lostTimeoutMs ?? 2000
      );

    let target =
      bot.players[params.username]?.entity;

    // ==============================
    // 1. 开始时就找不到玩家
    // ==============================

    if (!target) {
      return {
        skill: this.name,
        status: "FAILED",
        reason: "PLAYER_NOT_FOUND",
        startedAt,
        finishedAt: Date.now()
      };
    }

    let lastTargetPosition =
      target.position.clone();

    let targetLostAt: number | null = null;

    let pathing = false;

    try {
      while (true) {

        // ==============================
        // 2. 外部停止
        // ==============================

        if (signal.aborted) {
          this.stop(bot);

          return {
            skill: this.name,
            status: "CANCELLED",
            reason: "CANCELLED",
            startedAt,
            finishedAt: Date.now(),
            progress: {
              username: params.username
            }
          };
        }

        // ==============================
        // 3. 重新寻找玩家实体
        // ==============================

        target =
          bot.players[params.username]?.entity;

        if (!target) {

          if (targetLostAt === null)
            targetLostAt = Date.now();

          // 给短暂掉实体 / 区块变化留一点缓冲
          if (
            Date.now() - targetLostAt
            >= lostTimeoutMs
          ) {
            this.stop(bot);

            return {
              skill: this.name,
              status: "FAILED",
              reason: "TARGET_LOST",
              startedAt,
              finishedAt: Date.now(),
              progress: {
                username: params.username
              }
            };
          }

          await sleep(200);
          continue;
        }

        targetLostAt = null;

        // ==============================
        // 4. 真实距离
        // ==============================

        const distance =
          bot.entity.position.distanceTo(
            target.position
          );

        // ==============================
        // 5. 已经靠近玩家
        // ==============================

        if (distance <= followDistance) {

          if (pathing) {
            this.stopMovement(bot);
            pathing = false;
          }

          lastTargetPosition =
            target.position.clone();

          await sleep(200);
          continue;
        }

        // ==============================
        // 6. 玩家重新走远
        // ==============================

        const targetMoved =
          target.position.distanceTo(
            lastTargetPosition
          );

        if (
          !pathing &&
          distance >= resumeDistance
        ) {
          this.updateGoal(
            bot,
            target.position.x,
            target.position.y,
            target.position.z,
            followDistance
          );

          lastTargetPosition =
            target.position.clone();

          pathing = true;
        }

        // ==============================
        // 7. 玩家移动较大，更新目标
        // ==============================

        else if (
          pathing &&
          targetMoved >= 1.5
        ) {
          this.updateGoal(
            bot,
            target.position.x,
            target.position.y,
            target.position.z,
            followDistance
          );

          lastTargetPosition =
            target.position.clone();
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
        "[SKILL follow_player] error:",
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
    distance: number
  ): void {

    bot.pathfinder.setGoal(
      new goals.GoalNear(
        Math.floor(x),
        Math.floor(y),
        Math.floor(z),
        Math.ceil(distance)
      )
    );
  }

  private stopMovement(
    bot: SkillContext["bot"]
  ): void {

    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  }

  private stop(
    bot: SkillContext["bot"]
  ): void {

    this.stopMovement(bot);
  }
}