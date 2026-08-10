import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getHarvestSources,
  hasHarvestKnowledge
} from "../../knowledge/HarvestKnowledge";

import {
  CollectBlockSkill
} from "./CollectBlockSkill";


export interface CollectItemParams {
  item: string;
  amount: number;
  radius?: number;
  maxCandidates?: number;
}


export class CollectItemSkill
  implements Skill<CollectItemParams> {

  readonly name =
    "collect_item";

  readonly category =
    "ACTION" as const;

  private readonly blockCollector =
    new CollectBlockSkill();


  async execute(
    ctx: SkillContext,
    params: CollectItemParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();

    const { bot } = ctx;


    // ==============================
    // 1. 参数检查
    // ==============================

    if (
      !Number.isInteger(params.amount) ||
      params.amount <= 0
    ) {
      return {
        skill: this.name,

        status: "FAILED",

        reason: "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        progress: {
          item:
            params.item,

          requested:
            params.amount,

          collected:
            0
        }
      };
    }


    if (
      !bot.registry.itemsByName[
        params.item
      ]
    ) {
      return {
        skill: this.name,

        status: "FAILED",

        reason: "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        progress: {
          item:
            params.item,

          requested:
            params.amount,

          collected:
            0
        }
      };
    }


    // ==============================
    // 2. 是否知道怎么采集这个物品
    // ==============================

    if (
      !hasHarvestKnowledge(
        params.item
      )
    ) {
      return {
        skill: this.name,

        status: "FAILED",

        reason: "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        data: {
          item:
            params.item,

          error:
            "HARVEST_KNOWLEDGE_NOT_FOUND"
        }
      };
    }


    const radius =
      Math.max(
        1,
        Math.min(
          params.radius ?? 32,
          64
        )
      );


    const maxCandidates =
      Math.max(
        1,
        Math.min(
          params.maxCandidates ?? 16,
          32
        )
      );


    // ==============================
    // 3. 记录真实起始库存
    // ==============================

    const startCount =
      this.countItem(
        bot,
        params.item
      );


    const sources =
      getHarvestSources(
        params.item
      );


    const attemptedSources:
      string[] = [];


    // ==============================
    // 4. 按优先级尝试来源
    // ==============================

    for (
      const source
      of sources
    ) {

      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          attemptedSources,
          bot
        );
      }


      // 已经通过前一个来源拿到一些资源，
      // 重新计算还差多少。
      const currentCount =
        this.countItem(
          bot,
          params.item
        );


      const collected =
        Math.max(
          0,
          currentCount -
          startCount
        );


      const remaining =
        params.amount -
        collected;


      if (remaining <= 0) {
        return this.success(
          startedAt,
          params,
          startCount,
          attemptedSources,
          bot
        );
      }


      const blockInfo =
        bot.registry.blocksByName[
          source.block
        ];


      if (!blockInfo) {
        continue;
      }


      // ============================
      // 4.1 先看附近有没有这种来源
      // ============================

      const nearby =
        bot.findBlocks({

          matching:
            blockInfo.id,

          maxDistance:
            radius,

          count:
            1
        });


      if (
        nearby.length === 0
      ) {
        continue;
      }


      attemptedSources.push(
        source.block
      );


      // ============================
      // 4.2 复用已经验证成功的
      //     CollectBlockSkill
      //
      // 注意：
      // 这里没有再次经过 SkillManager，
      // 所以不会产生 BUSY。
      //
      // 外部看到的仍然只有
      // collect_item 这一个 ACTION。
      // ============================

      const result =
        await this.blockCollector.execute(
          ctx,
          {
            block:
              source.block,

            expectedItem:
              source.expectedItem,

            amount:
              remaining,

            radius,

            maxCandidates
          },
          signal
        );


      // ============================
      // 4.3 Cancel 直接向上传递
      // ============================

      if (
        signal.aborted ||
        result.status ===
          "CANCELLED"
      ) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          attemptedSources,
          bot
        );
      }


      // ============================
      // 4.4 不信任内部 SUCCESS，
      //     再看真实 Inventory
      // ============================

      const afterCount =
        this.countItem(
          bot,
          params.item
        );


      if (
        afterCount -
        startCount >=
        params.amount
      ) {
        return this.success(
          startedAt,
          params,
          startCount,
          attemptedSources,
          bot
        );
      }


      // ============================
      // 4.5 这些失败可以换其他来源继续
      //
      // 例如：
      // grass_block 走不到
      // → 尝试 dirt
      // ============================

      if (
        result.status === "FAILED" &&
        (
          result.reason ===
            "RESOURCE_NOT_FOUND" ||

          result.reason ===
            "PATH_NOT_FOUND" ||

          result.reason ===
            "TARGET_NOT_ACCESSIBLE" ||

          result.reason ===
            "BLOCK_NOT_DIGGABLE"
        )
      ) {
        continue;
      }


      // ============================
      // 4.6 严重失败不要盲目换来源
      //
      // INVENTORY_FULL
      // NO_PROGRESS
      // UNKNOWN
      // ...
      // ============================

      if (
        result.status ===
        "FAILED"
      ) {
        return {
          skill:
            this.name,

          status:
            "FAILED",

          reason:
            result.reason,

          startedAt,

          finishedAt:
            Date.now(),

          progress:
            this.buildProgress(
              params,
              startCount,
              attemptedSources,
              bot
            )
        };
      }
    }


    // ==============================
    // 5. 所有来源都试过
    // ==============================

    const finalCollected =
      this.countItem(
        bot,
        params.item
      ) -
      startCount;


    if (
      finalCollected >=
      params.amount
    ) {
      return this.success(
        startedAt,
        params,
        startCount,
        attemptedSources,
        bot
      );
    }


    return {

      skill:
        this.name,

      status:
        "FAILED",

      reason:
        "RESOURCE_NOT_FOUND",

      startedAt,

      finishedAt:
        Date.now(),

      progress:
        this.buildProgress(
          params,
          startCount,
          attemptedSources,
          bot
        )
    };
  }


  // ==============================
  // Inventory Count
  // ==============================

  private countItem(
    bot: SkillContext["bot"],
    itemName: string
  ): number {

    return bot.inventory
      .items()
      .filter(
        item =>
          item.name ===
          itemName
      )
      .reduce(
        (total, item) =>
          total + item.count,
        0
      );
  }


  // ==============================
  // Progress
  // ==============================

  private buildProgress(
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    bot: SkillContext["bot"]
  ) {

    const currentCount =
      this.countItem(
        bot,
        params.item
      );


    return {
      item:
        params.item,

      requested:
        params.amount,

      collected:
        Math.max(
          0,
          currentCount -
          startCount
        ),

      startCount,

      currentCount,

      attemptedSources:
        [...attemptedSources]
    };
  }


  // ==============================
  // SUCCESS
  // ==============================

  private success(
    startedAt: number,
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    bot: SkillContext["bot"]
  ): SkillResult {

    return {
      skill:
        this.name,

      status:
        "SUCCESS",

      startedAt,

      finishedAt:
        Date.now(),

      progress:
        this.buildProgress(
          params,
          startCount,
          attemptedSources,
          bot
        )
    };
  }


  // ==============================
  // CANCELLED
  // ==============================

  private cancelled(
    startedAt: number,
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    bot: SkillContext["bot"]
  ): SkillResult {

    return {
      skill:
        this.name,

      status:
        "CANCELLED",

      reason:
        "CANCELLED",

      startedAt,

      finishedAt:
        Date.now(),

      progress:
        this.buildProgress(
          params,
          startCount,
          attemptedSources,
          bot
        )
    };
  }
}