import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getHarvestSources,
  toolMeetsRequirement,
  type HarvestSource
} from "../../knowledge/HarvestKnowledge";

import {
  CollectBlockSkill
} from "./CollectBlockSkill";


// =====================================================
// Params
//
// collect_item 的 amount 是“增量语义”
//
// 当前 cobblestone = 2
// collect_item(cobblestone, 3)
//
// 最终目标：
// cobblestone >= 5
// =====================================================

export interface CollectItemParams {

  // 最终希望进入 Inventory 的 Item
  //
  // 例如：
  // cobblestone
  // dirt
  // raw_iron
  item: string;


  // 希望额外获得多少
  amount?: number;


  // 搜索资源的半径
  radius?: number;


  // 每一种 Source 最多检查多少候选
  maxCandidates?: number;


  pickupWaitTicks?: number;
}


// =====================================================
// CollectItemSkill
// =====================================================

export class CollectItemSkill
  implements Skill<CollectItemParams> {

  readonly name =
    "collect_item";


  readonly category =
    "ACTION" as const;


  // ===================================================
  // 直接复用底层 CollectBlockSkill
  //
  // 注意：
  //
  // 不通过 SkillManager 再调用。
  //
  // 外层 currentSkill 仍然只是：
  //
  // collect_item
  //
  // 不会产生嵌套 ACTION BUSY。
  // ===================================================

  private readonly collectBlock =
    new CollectBlockSkill();


  // ===================================================
  // Execute
  // ===================================================

  async execute(
    ctx: SkillContext,
    params: CollectItemParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();


    const { bot } =
      ctx;


    // =================================================
    // 1. 参数
    // =================================================

    const amount =
      params.amount ??
      1;


    const radius =
      Math.max(
        1,
        Math.min(
          params.radius ??
          32,
          128
        )
      );


    const maxCandidates =
      Math.max(
        1,
        Math.min(
          params.maxCandidates ??
          32,
          128
        )
      );


    const pickupWaitTicks =
      Math.max(
        1,
        Math.min(
          params.pickupWaitTicks ??
          12,
          40
        )
      );


    // =================================================
    // 2. 参数验证
    // =================================================

    if (
      !params.item ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {

      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        data: {

          item:
            params.item,

          amount
        }
      };
    }


    // =================================================
    // 3. Minecraft 当前版本是否存在这个 Item
    // =================================================

    const itemInfo =
      bot.registry.itemsByName[
        params.item
      ];


    if (!itemInfo) {

      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        data: {

          item:
            params.item,

          error:
            "ITEM_NOT_FOUND"
        }
      };
    }


    // =================================================
    // 4. Harvest Knowledge
    //
    // 注意：
    //
    // 这里返回的是 Source。
    //
    // 例如：
    //
    // item = cobblestone
    //
    // source = {
    //   block: "stone",
    //   expectedItem: "cobblestone"
    // }
    //
    // item 和 block 不能混为一谈。
    // =================================================

    const sources =
      getHarvestSources(
        params.item
      );


    if (
      sources.length === 0
    ) {

      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          "INVALID_ARGUMENT",

        startedAt,

        finishedAt:
          Date.now(),

        data: {

          item:
            params.item,

          error:
            "NO_HARVEST_KNOWLEDGE"
        }
      };
    }


    // =================================================
    // 5. 开始前 Inventory
    // =================================================

    const startCount =
      this.countItem(
        ctx,
        params.item
      );


    const targetCount =
      startCount +
      amount;


    // =================================================
    // 用于最终错误分类
    // =================================================

    const attemptedSources:
      Array<{
        block: string;
        expectedItem: string;
        found: boolean;
        requiredTool?: unknown;
        selectedTool?: string | null;
        result?: unknown;
      }> = [];


    const toolBlockedSources:
      Array<{
        block: string;
        expectedItem: string;
        requiredTool: unknown;
      }> = [];


    let foundAnySourceBlock =
      false;


    let lastRetryableFailure:
      SkillResult | null =
      null;


    // =================================================
    // 6. 逐个尝试 Source
    //
    // Knowledge 的顺序就是优先级。
    //
    // 例如 dirt：
    //
    // grass_block
    // ↓
    // dirt
    // =================================================

    for (
      const source
      of sources
    ) {

      // ===============================================
      // Cancel
      // ===============================================

      if (
        signal.aborted
      ) {

        return this.cancelledResult(
          ctx,
          params,
          amount,
          startCount,
          startedAt,
          attemptedSources
        );
      }


      // ===============================================
      // 目标可能已经在上一个 Source 中部分获得
      // ===============================================

      const currentCount =
        this.countItem(
          ctx,
          params.item
        );


      if (
        currentCount >=
        targetCount
      ) {

        return this.successResult(
          ctx,
          params,
          amount,
          startCount,
          startedAt,
          attemptedSources
        );
      }


      const remaining =
        targetCount -
        currentCount;


      // ===============================================
      // 7. 关键修复：
      //
      // 搜索 source.block
      //
      // 不是 params.item
      // ===============================================

      const sourceBlockInfo =
        bot.registry.blocksByName[
          source.block
        ];


      if (!sourceBlockInfo) {

        attemptedSources.push({

          block:
            source.block,

          expectedItem:
            source.expectedItem,

          found:
            false,

          requiredTool:
            source.requiredTool,

          result: {
            error:
              "SOURCE_BLOCK_NOT_IN_REGISTRY"
          }
        });


        continue;
      }


      // ===============================================
      // 8. 先判断世界里有没有这个 Source Block
      //
      // cobblestone:
      //
      // 查的是 stone
      //
      // raw_iron:
      //
      // 查的是 iron_ore
      // ===============================================

      const positions =
        bot.findBlocks({

          matching:
            sourceBlockInfo.id,

          maxDistance:
            radius,

          count:
            maxCandidates
        });


      const sourceFound =
        positions.length > 0;


      if (
        !sourceFound
      ) {

        attemptedSources.push({

          block:
            source.block,

          expectedItem:
            source.expectedItem,

          found:
            false,

          requiredTool:
            source.requiredTool
        });


        // 当前来源没找到。
        // 尝试 HarvestKnowledge 中下一个来源。
        continue;
      }


      foundAnySourceBlock =
        true;


      // =================================================
      // 9. Tool Requirement
      //
      // Source 确实存在以后再检查工具。
      //
      // 这样错误分类会更准确：
      //
      // 有 stone 但没木镐
      // → TOOL_MISSING
      //
      // 而不是 RESOURCE_NOT_FOUND。
      // =================================================

      let selectedTool:
        string | null =
        null;


      if (
        source.requiredTool
      ) {

        const tool =
          this.findValidTool(
            ctx,
            source
          );


        if (!tool) {

          toolBlockedSources.push({

            block:
              source.block,

            expectedItem:
              source.expectedItem,

            requiredTool:
              source.requiredTool
          });


          attemptedSources.push({

            block:
              source.block,

            expectedItem:
              source.expectedItem,

            found:
              true,

            requiredTool:
              source.requiredTool,

            selectedTool:
              null,

            result: {
              error:
                "TOOL_MISSING"
            }
          });


          // 也许另一个 Source 不需要这个工具，
          // 所以先继续。
          continue;
        }


        selectedTool =
          tool.name;


        // ===============================================
        // 显式装备符合要求的工具
        // ===============================================

        try {

          await bot.equip(
            tool,
            "hand"
          );

        } catch (error) {

          attemptedSources.push({

            block:
              source.block,

            expectedItem:
              source.expectedItem,

            found:
              true,

            requiredTool:
              source.requiredTool,

            selectedTool,

            result: {
              error:
                "TOOL_EQUIP_FAILED",

              detail:
                String(error)
            }
          });


          // 换下一个 Source。
          continue;
        }
      }


      // =================================================
      // 10. 真正调用 CollectBlock
      //
      // 这是整个修复最关键的地方：
      //
      // block = source.block
      //
      // expectedItem = source.expectedItem
      //
      //
      // cobblestone:
      //
      // block = stone
      // expectedItem = cobblestone
      // =================================================

      const collectResult =
        await this.collectBlock.execute(

          ctx,

          {

            block:
              source.block,

            expectedItem:
              source.expectedItem,

            amount:
              remaining,

            radius,

            maxCandidates,

            pickupWaitTicks
          },

          signal
        );


      attemptedSources.push({

        block:
          source.block,

        expectedItem:
          source.expectedItem,

        found:
          true,

        requiredTool:
          source.requiredTool,

        selectedTool,

        result:
          collectResult
      });


      // =================================================
      // 11. Cancel
      // =================================================

      if (
        signal.aborted ||
        collectResult.status ===
          "CANCELLED"
      ) {

        return this.cancelledResult(
          ctx,
          params,
          amount,
          startCount,
          startedAt,
          attemptedSources
        );
      }


      // =================================================
      // 12. 重新读取 Inventory
      //
      // 不相信 collectResult 自己说收集了多少。
      //
      // Inventory 才是真实状态。
      // =================================================

      const afterCollectCount =
        this.countItem(
          ctx,
          params.item
        );


      if (
        afterCollectCount >=
        targetCount
      ) {

        return this.successResult(
          ctx,
          params,
          amount,
          startCount,
          startedAt,
          attemptedSources
        );
      }


      // =================================================
      // 13. CollectBlock SUCCESS
      //
      // 但还没达到总目标。
      //
      // 例如：
      //
      // 当前 Source 实际只够获得2个，
      // 目标是4个。
      //
      // 继续尝试下一个 Source。
      // =================================================

      if (
        collectResult.status ===
        "SUCCESS"
      ) {

        continue;
      }


      // =================================================
      // 14. Retryable Failure
      //
      // 当前 Source 不好用，
      // 尝试另一个合法来源。
      // =================================================

      if (
        collectResult.status ===
          "FAILED" &&
        this.isRetryableSourceFailure(
          collectResult.reason
        )
      ) {

        lastRetryableFailure =
          collectResult;


        continue;
      }


      // =================================================
      // 15. 严重错误直接向上传播
      //
      // 例如 Inventory Full。
      // =================================================

      if (
        collectResult.status ===
        "FAILED"
      ) {

        return {

          skill:
            this.name,

          status:
            "FAILED",

          reason:
            collectResult.reason ??
            "UNKNOWN",

          startedAt,

          finishedAt:
            Date.now(),

          progress:
            this.buildProgress(
              ctx,
              params,
              amount,
              startCount
            ),

          data: {

            item:
              params.item,

            source: {

              block:
                source.block,

              expectedItem:
                source.expectedItem
            },

            result:
              collectResult,

            attemptedSources
          }
        };
      }
    }


    // =================================================
    // 16. 所有 Source 都尝试完了
    // =================================================

    const finalCount =
      this.countItem(
        ctx,
        params.item
      );


    // =================================================
    // 理论上已经够了
    // =================================================

    if (
      finalCount >=
      targetCount
    ) {

      return this.successResult(
        ctx,
        params,
        amount,
        startCount,
        startedAt,
        attemptedSources
      );
    }


    // =================================================
    // 17. 明明确实找到了资源块，
    // 但所有可用 Source 都被工具要求挡住。
    //
    // 例如：
    //
    // stone 找到了
    // wooden_pickaxe 没有
    //
    // 必须返回 TOOL_MISSING。
    //
    // 这对 EnsureItem 非常重要：
    //
    // TOOL_MISSING
    // ↓
    // 自动 ensure wooden_pickaxe
    // =================================================

    if (
      foundAnySourceBlock &&
      toolBlockedSources.length >
        0
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
            ctx,
            params,
            amount,
            startCount
          ),

        data: {

          item:
            params.item,

          toolBlockedSources,

          attemptedSources
        }
      };
    }


    // =================================================
    // 18. 资源确实存在，
    // 但是所有 CollectBlock 尝试都失败。
    //
    // 保留最真实的底层原因。
    //
    // 不要错误转换成 RESOURCE_NOT_FOUND。
    // =================================================

    if (
      foundAnySourceBlock &&
      lastRetryableFailure
    ) {

      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          lastRetryableFailure.reason ??
          "TARGET_NOT_ACCESSIBLE",

        startedAt,

        finishedAt:
          Date.now(),

        progress:
          this.buildProgress(
            ctx,
            params,
            amount,
            startCount
          ),

        data: {

          item:
            params.item,

          attemptedSources,

          lastFailure:
            lastRetryableFailure
        }
      };
    }


    // =================================================
    // 19. 真正一个 Source Block 都没找到
    //
    // 只有这种情况才叫：
    //
    // RESOURCE_NOT_FOUND
    // =================================================

    if (
      !foundAnySourceBlock
    ) {

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
            ctx,
            params,
            amount,
            startCount
          ),

        data: {

          item:
            params.item,

          radius,

          attemptedSources,

          searchedBlocks:
            sources.map(
              source =>
                source.block
            )
        }
      };
    }


    // =================================================
    // 20. 兜底
    // =================================================

    return {

      skill:
        this.name,

      status:
        "FAILED",

      reason:
        "NO_PROGRESS",

      startedAt,

      finishedAt:
        Date.now(),

      progress:
        this.buildProgress(
          ctx,
          params,
          amount,
          startCount
        ),

      data: {

        item:
          params.item,

        attemptedSources
      }
    };
  }


  // ===================================================
  // Find Valid Tool
  //
  // 找到背包中满足 HarvestRequirement 的工具。
  // ===================================================

  private findValidTool(
    ctx: SkillContext,
    source: HarvestSource
  ) {

    if (
      !source.requiredTool
    ) {

      return null;
    }


    const candidates =
      ctx.bot.inventory
        .items()
        .filter(
          item =>
            toolMeetsRequirement(
              item.name,
              source.requiredTool!
            )
        );


    if (
      candidates.length ===
      0
    ) {

      return null;
    }


    // =================================================
    // 当前阶段只要满足最低要求即可。
    //
    // 后面可以再按：
    //
    // 耐久
    // 速度
    // 工具等级
    //
    // 排序。
    // =================================================

    return candidates[0];
  }


  // ===================================================
  // 哪些底层失败允许切换 Source？
  // ===================================================

  private isRetryableSourceFailure(
    reason:
      SkillResult["reason"]
  ): boolean {

    return (
      reason ===
        "RESOURCE_NOT_FOUND" ||

      reason ===
        "PATH_NOT_FOUND" ||

      reason ===
        "TARGET_NOT_ACCESSIBLE" ||

      reason ===
        "BLOCK_NOT_DIGGABLE"
    );
  }


  // ===================================================
  // Inventory Count
  // ===================================================

  private countItem(
    ctx: SkillContext,
    itemName: string
  ): number {

    return ctx.bot.inventory
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
    ctx: SkillContext,
    params: CollectItemParams,
    amount: number,
    startCount: number
  ) {

    const currentCount =
      this.countItem(
        ctx,
        params.item
      );


    return {

      item:
        params.item,

      requested:
        amount,

      collected:
        Math.max(
          0,
          currentCount -
          startCount
        ),

      startCount,

      currentCount,

      targetCount:
        startCount +
        amount,

      missing:
        Math.max(
          0,
          startCount +
          amount -
          currentCount
        )
    };
  }


  // ===================================================
  // SUCCESS
  // ===================================================

  private successResult(
    ctx: SkillContext,
    params: CollectItemParams,
    amount: number,
    startCount: number,
    startedAt: number,
    attemptedSources: unknown[]
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
          ctx,
          params,
          amount,
          startCount
        ),

      data: {

        item:
          params.item,

        attemptedSources
      }
    };
  }


  // ===================================================
  // CANCELLED
  // ===================================================

  private cancelledResult(
    ctx: SkillContext,
    params: CollectItemParams,
    amount: number,
    startCount: number,
    startedAt: number,
    attemptedSources: unknown[]
  ): SkillResult {

    const { bot } =
      ctx;


    try {

      bot.pathfinder.setGoal(
        null
      );

    } catch {
      // ignore
    }


    try {

      bot.clearControlStates();

    } catch {
      // ignore
    }


    try {

      bot.stopDigging();

    } catch {
      // ignore
    }


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
          ctx,
          params,
          amount,
          startCount
        ),

      data: {

        item:
          params.item,

        attemptedSources
      }
    };
  }
}