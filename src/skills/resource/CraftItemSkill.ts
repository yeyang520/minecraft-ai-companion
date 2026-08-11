import { goals } from "mineflayer-pathfinder";

import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getCraftRecipe,
  hasCraftingKnowledge
} from "../../knowledge/CraftingKnowledge";


export interface CraftItemParams {
  item: string;
  amount: number;
  craftingTableRadius?: number;
}


export class CraftItemSkill
  implements Skill<CraftItemParams> {

  readonly name = "craft_item";
  readonly category = "ACTION" as const;


  async execute(
    ctx: SkillContext,
    params: CraftItemParams,
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
      return this.failed(
        startedAt,
        "INVALID_ARGUMENT",
        params,
        0,
        null,
        bot
      );
    }


    const itemInfo =
      bot.registry.itemsByName[
        params.item
      ];


    if (!itemInfo) {
      return this.failed(
        startedAt,
        "INVALID_ARGUMENT",
        params,
        0,
        null,
        bot
      );
    }


    // =================================================
    // 2. Crafting Knowledge
    // =================================================

    if (
      !hasCraftingKnowledge(
        params.item
      )
    ) {
      return this.failed(
        startedAt,
        "INVALID_ARGUMENT",
        params,
        0,
        null,
        bot
      );
    }


    const knowledge =
      getCraftRecipe(
        params.item
      )!;


    // =================================================
    // 3. 开始库存
    // =================================================

    const startCount =
      this.countItem(
        bot,
        params.item
      );


    // 每次配方实际产出多少
    const outputPerCraft =
      knowledge.outputCount;


    // 需要执行多少次配方
    const craftOperations =
      Math.ceil(
        params.amount /
        outputPerCraft
      );


    // 实际会生成多少
    const expectedOutput =
      craftOperations *
      outputPerCraft;


    // =================================================
    // 4. Cancel
    // =================================================

    const onAbort = () => {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
    };


    signal.addEventListener(
      "abort",
      onAbort
    );


    try {

      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          craftOperations,
          null,
          bot
        );
      }


      // =================================================
      // 5. 如果需要 Crafting Table
      // =================================================

      let craftingTable:
        ReturnType<typeof bot.findBlock> =
        null;


      if (
        knowledge.requiresCraftingTable
      ) {

        const tableInfo =
          bot.registry.blocksByName[
            "crafting_table"
          ];


        if (!tableInfo) {
          return this.failed(
            startedAt,
            "CRAFTING_TABLE_NOT_FOUND",
            params,
            startCount,
            null,
            bot
          );
        }


        const radius =
          Math.max(
            1,
            Math.min(
              params.craftingTableRadius ??
                16,
              64
            )
          );


        craftingTable =
          bot.findBlock({

            matching:
              tableInfo.id,

            maxDistance:
              radius
          });


        // ===============================================
        // 附近根本没有工作台
        // ===============================================

        if (!craftingTable) {
          return this.failed(
            startedAt,
            "CRAFTING_TABLE_NOT_FOUND",
            params,
            startCount,
            null,
            bot
          );
        }


        // ===============================================
        // 5.1 如果太远或者看不见，就靠近
        // ===============================================

        if (
          bot.entity.position
            .distanceTo(
              craftingTable.position
            ) > 3 ||
          !bot.canSeeBlock(
            craftingTable
          )
        ) {

          try {

            await bot.pathfinder.goto(

              new goals.GoalNear(
                craftingTable.position.x,
                craftingTable.position.y,
                craftingTable.position.z,
                2
              )
            );
          }
          catch {

            if (signal.aborted) {
              return this.cancelled(
                startedAt,
                params,
                startCount,
                craftOperations,
                craftingTable.position,
                bot
              );
            }


            return this.failed(
              startedAt,
              "PATH_NOT_FOUND",
              params,
              startCount,
              craftingTable.position,
              bot
            );
          }
        }


        if (signal.aborted) {
          return this.cancelled(
            startedAt,
            params,
            startCount,
            craftOperations,
            craftingTable.position,
            bot
          );
        }


        // ===============================================
        // 5.2 靠近后重新读取真实世界工作台
        // ===============================================

        const refreshedTable =
          bot.blockAt(
            craftingTable.position
          );


        if (
          !refreshedTable ||
          refreshedTable.name !==
            "crafting_table"
        ) {
          return this.failed(
            startedAt,
            "CRAFTING_TABLE_NOT_FOUND",
            params,
            startCount,
            craftingTable.position,
            bot
          );
        }


        craftingTable =
          refreshedTable;
      }


      // =================================================
      // 6. 从 Mineflayer 查询当前真实可用 Recipe
      //
      // minResultCount = params.amount
      //
      // 这样不仅要求配方存在，
      // 还要求当前材料足够制作这么多。
      // =================================================

      const recipes =
        bot.recipesFor(
          itemInfo.id,
          null,
          params.amount,
          craftingTable
        );


      if (
        recipes.length === 0
      ) {
        return this.failed(
          startedAt,
          "RECIPE_NOT_AVAILABLE",
          params,
          startCount,
          craftingTable?.position ??
            null,
          bot
        );
      }


      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          craftOperations,
          craftingTable?.position ??
            null,
          bot
        );
      }


      // =================================================
      // 7. 真正合成
      //
      // 注意：
      //
      // craftOperations 是“执行配方次数”
      //
      // 例如 stick：
      // 一次 -> 4
      //
      // 请求5个：
      // craftOperations = 2
      // 最终应得到8个
      // =================================================

      try {

        await bot.craft(
          recipes[0],
          craftOperations,
          craftingTable
        );
      }
      catch (error) {

        console.error(
          "[SKILL craft_item] craft failed:",
          error
        );


        if (signal.aborted) {
          return this.cancelled(
            startedAt,
            params,
            startCount,
            craftOperations,
            craftingTable?.position ??
              null,
            bot
          );
        }


        return this.failed(
          startedAt,
          "CRAFT_FAILED",
          params,
          startCount,
          craftingTable?.position ??
            null,
          bot
        );
      }


      // =================================================
      // 8. 即使 craft() 完成，
      //    我们仍然重新读取真实 Inventory
      // =================================================

      const currentCount =
        this.countItem(
          bot,
          params.item
        );


      const crafted =
        currentCount -
        startCount;


      // =================================================
      // 9. 如果 craft 时用户取消
      //
      // craft 本身可能已经发生，
      // 所以仍然返回真实 crafted 数量。
      // =================================================

      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          craftOperations,
          craftingTable?.position ??
            null,
          bot
        );
      }


      // =================================================
      // 10. Inventory Verifier
      // =================================================

      if (
        crafted <
        params.amount
      ) {
        return this.failed(
          startedAt,
          "NO_PROGRESS",
          params,
          startCount,
          craftingTable?.position ??
            null,
          bot
        );
      }


      // =================================================
      // 11. SUCCESS
      // =================================================

      return {

        skill:
          this.name,

        status:
          "SUCCESS",

        startedAt,

        finishedAt:
          Date.now(),

        progress: {

          item:
            params.item,

          requested:
            params.amount,

          crafted,

          outputPerCraft,

          craftOperations,

          expectedOutput,

          startCount,

          currentCount,

          usedCraftingTable:
            knowledge
              .requiresCraftingTable,

          craftingTablePosition:
            craftingTable
              ? {
                  x:
                    craftingTable.position.x,

                  y:
                    craftingTable.position.y,

                  z:
                    craftingTable.position.z
                }
              : null
        }
      };
    }
    catch (error) {

      console.error(
        "[SKILL craft_item] unexpected error:",
        error
      );


      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          craftOperations,
          null,
          bot
        );
      }


      return this.failed(
        startedAt,
        "UNKNOWN",
        params,
        startCount,
        null,
        bot
      );
    }
    finally {

      signal.removeEventListener(
        "abort",
        onAbort
      );


      bot.pathfinder.setGoal(
        null
      );


      bot.clearControlStates();
    }
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
  // CANCELLED
  // ===================================================

  private cancelled(
    startedAt: number,
    params: CraftItemParams,
    startCount: number,
    craftOperations: number,
    craftingTablePosition:
      {
        x: number;
        y: number;
        z: number;
      } | null,
    bot: SkillContext["bot"]
  ): SkillResult {

    const currentCount =
      this.countItem(
        bot,
        params.item
      );


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

      progress: {

        item:
          params.item,

        requested:
          params.amount,

        crafted:
          Math.max(
            0,
            currentCount -
            startCount
          ),

        craftOperations,

        startCount,

        currentCount,

        craftingTablePosition
      }
    };
  }


  // ===================================================
  // FAILED
  // ===================================================

  private failed(
    startedAt: number,

    reason:
      | "INVALID_ARGUMENT"
      | "CRAFTING_TABLE_NOT_FOUND"
      | "RECIPE_NOT_AVAILABLE"
      | "CRAFT_FAILED"
      | "PATH_NOT_FOUND"
      | "NO_PROGRESS"
      | "UNKNOWN",

    params: CraftItemParams,

    startCount: number,

    craftingTablePosition:
      {
        x: number;
        y: number;
        z: number;
      } | null,

    bot: SkillContext["bot"]

  ): SkillResult {

    const currentCount =
      this.countItem(
        bot,
        params.item
      );


    return {

      skill:
        this.name,

      status:
        "FAILED",

      reason,

      startedAt,

      finishedAt:
        Date.now(),

      progress: {

        item:
          params.item,

        requested:
          params.amount,

        crafted:
          Math.max(
            0,
            currentCount -
            startCount
          ),

        startCount,

        currentCount,

        craftingTablePosition
      }
    };
  }
}