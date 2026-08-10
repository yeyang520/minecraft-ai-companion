import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getHarvestSources,
  hasHarvestKnowledge,
  toolMeetsRequirement
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

  readonly name = "collect_item";
  readonly category = "ACTION" as const;

  private readonly blockCollector =
    new CollectBlockSkill();


  async execute(
    ctx: SkillContext,
    params: CollectItemParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt = Date.now();
    const { bot } = ctx;


    // =================================================
    // 1. 参数检查
    // =================================================

    if (
      !Number.isInteger(params.amount) ||
      params.amount <= 0
    ) {
      return {
        skill: this.name,
        status: "FAILED",
        reason: "INVALID_ARGUMENT",
        startedAt,
        finishedAt: Date.now(),

        progress: {
          item: params.item,
          requested: params.amount,
          collected: 0
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
        finishedAt: Date.now(),

        progress: {
          item: params.item,
          requested: params.amount,
          collected: 0
        }
      };
    }


    // =================================================
    // 2. Harvest Knowledge
    // =================================================

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
        finishedAt: Date.now(),

        data: {
          item: params.item,
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


    // =================================================
    // 3. 记录开始库存
    // =================================================

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


    const toolBlockedSources:
      string[] = [];


    let foundNearbySource =
      false;


    let foundUsableSource =
      false;


    // =================================================
    // 4. 按 Harvest Knowledge 优先级寻找来源
    // =================================================

    for (
      const source
      of sources
    ) {

      // ===============================================
      // Cancel
      // ===============================================

      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          attemptedSources,
          toolBlockedSources,
          bot
        );
      }


      // ===============================================
      // 重新读取真实 Inventory
      //
      // 前一种来源可能已经拿到一部分资源。
      // ===============================================

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


      if (
        remaining <= 0
      ) {
        return this.success(
          startedAt,
          params,
          startCount,
          attemptedSources,
          toolBlockedSources,
          bot
        );
      }


      // ===============================================
      // 当前 Minecraft 版本是否存在这种 Block
      // ===============================================

      const blockInfo =
        bot.registry.blocksByName[
          source.block
        ];


      if (!blockInfo) {
        continue;
      }


      // ===============================================
      // 4.1 先检查附近有没有这个资源来源
      // ===============================================

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


      foundNearbySource =
        true;


      // ===============================================
      // 4.2 检查工具要求
      //
      // 例如：
      //
      // raw_iron
      // → iron_ore
      // → stone_pickaxe+
      // ===============================================

      if (
        source.requiredTool
      ) {

        const validTool =
          bot.inventory
            .items()
            .find(
              item =>
                toolMeetsRequirement(
                  item.name,
                  source.requiredTool!
                )
            );


        // =============================================
        // 附近有矿，但当前工具不够
        //
        // 不允许进入 CollectBlockSkill。
        // 更不能拿木镐去尝试。
        // =============================================

        if (!validTool) {

          toolBlockedSources.push(
            source.block
          );

          continue;
        }


        // =============================================
        // 已经知道这个工具符合最低要求。
        //
        // 先明确装备。
        // =============================================

        try {

          await bot.equip(
            validTool,
            "hand"
          );
        }
        catch {

          return {
            skill: this.name,
            status: "FAILED",
            reason: "TOOL_MISSING",
            startedAt,
            finishedAt: Date.now(),

            progress:
              this.buildProgress(
                params,
                startCount,
                attemptedSources,
                toolBlockedSources,
                bot
              )
          };
        }
      }


      foundUsableSource =
        true;


      attemptedSources.push(
        source.block
      );


      // ===============================================
      // 4.3 调用已经验证过的 CollectBlockSkill
      //
      // 不经过 SkillManager，
      // 因此不会产生 ACTION BUSY。
      // ===============================================

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


      // ===============================================
      // 4.4 Cancel
      // ===============================================

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
          toolBlockedSources,
          bot
        );
      }


      // ===============================================
      // 4.5 最终仍然以真实 Inventory 为准
      //
      // 不盲信 CollectBlockSkill 的返回。
      // ===============================================

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
          toolBlockedSources,
          bot
        );
      }


      // ===============================================
      // 4.6 当前来源失败，但可以换其他来源
      //
      // 例如：
      //
      // iron_ore 走不到
      // → 尝试 deepslate_iron_ore
      // ===============================================

      if (
        result.status ===
          "FAILED" &&
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


      // ===============================================
      // 4.7 其他严重错误直接向上返回
      //
      // NO_PROGRESS
      // INVENTORY_FULL
      // UNKNOWN
      // ...
      // ===============================================

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
              toolBlockedSources,
              bot
            )
        };
      }
    }


    // =================================================
    // 5. 所有来源处理完
    // =================================================

    const finalCount =
      this.countItem(
        bot,
        params.item
      );


    const finalCollected =
      finalCount -
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
        toolBlockedSources,
        bot
      );
    }


    // =================================================
    // 6. 附近确实有资源，但是所有可见来源
    //    都被工具要求挡住
    //
    // 例如：
    //
    // 看见 iron_ore
    // 只有 wooden_pickaxe
    // ================================================

    if (
      foundNearbySource &&
      !foundUsableSource &&
      toolBlockedSources.length > 0
    ) {
      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          "TOOL_MISSING",

        startedAt,

        finishedAt:
          Date.now(),

        progress:
          this.buildProgress(
            params,
            startCount,
            attemptedSources,
            toolBlockedSources,
            bot
          )
      };
    }


    // =================================================
    // 7. 没找到可以获得该物品的资源
    // =================================================

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
          toolBlockedSources,
          bot
        )
    };
  }


  // ===================================================
  // Inventory Count
  // ===================================================

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
        (
          total,
          item
        ) =>
          total +
          item.count,
        0
      );
  }


  // ===================================================
  // Progress
  // ===================================================

  private buildProgress(
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    toolBlockedSources: string[],
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
        [...attemptedSources],

      toolBlockedSources:
        [...toolBlockedSources]
    };
  }


  // ===================================================
  // SUCCESS
  // ===================================================

  private success(
    startedAt: number,
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    toolBlockedSources: string[],
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
          toolBlockedSources,
          bot
        )
    };
  }


  // ===================================================
  // CANCELLED
  // ===================================================

  private cancelled(
    startedAt: number,
    params: CollectItemParams,
    startCount: number,
    attemptedSources: string[],
    toolBlockedSources: string[],
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
          toolBlockedSources,
          bot
        )
    };
  }
}