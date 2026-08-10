import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getCraftRecipe,
  hasCraftingKnowledge
} from "../../knowledge/CraftingKnowledge";


export interface CheckCraftRequirementParams {

  item: string;

  amount?: number;

  craftingTableRadius?: number;
}


export class CheckCraftRequirementSkill
  implements Skill<CheckCraftRequirementParams> {

  readonly name =
    "check_craft_requirement";

  readonly category =
    "QUERY" as const;


  async execute(
    ctx: SkillContext,
    params: CheckCraftRequirementParams,
    _signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();

    const { bot } =
      ctx;


    // =================================================
    // 1. 参数检查
    // =================================================

    const amount =
      params.amount ?? 1;


    if (
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
          Date.now()
      };
    }


    if (
      !bot.registry.itemsByName[
        params.item
      ]
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
            "ITEM_NOT_FOUND"
        }
      };
    }


    // =================================================
    // 2. 是否有 Crafting Knowledge
    // =================================================

    if (
      !hasCraftingKnowledge(
        params.item
      )
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
            "CRAFTING_KNOWLEDGE_NOT_FOUND"
        }
      };
    }


    const recipe =
      getCraftRecipe(
        params.item
      )!;


    // =================================================
    // 3. 计算实际需要执行多少次 Recipe
    //
    // 比如：
    //
    // stick 每次产出4个
    //
    // 请求5个
    // → 需要合成2次
    // → 实际产出8个
    // =================================================

    const craftOperations =
      Math.ceil(
        amount /
        recipe.outputCount
      );


    const actualOutput =
      craftOperations *
      recipe.outputCount;


    // =================================================
    // 4. 检查所有材料
    // =================================================

    const ingredients =
      recipe.ingredients.map(
        ingredient => {

          const required =
            ingredient.count *
            craftOperations;


          const available =
            this.countItem(
              bot,
              ingredient.item
            );


          const missing =
            Math.max(
              0,
              required -
              available
            );


          return {

            item:
              ingredient.item,

            required,

            available,

            missing
          };
        }
      );


    const missingMaterials =
      ingredients.filter(
        ingredient =>
          ingredient.missing > 0
      );


    // =================================================
    // 5. Crafting Table
    // =================================================

    let craftingTableFound =
      true;


    let craftingTablePosition:
      {
        x: number;
        y: number;
        z: number;
      } | null = null;


    if (
      recipe.requiresCraftingTable
    ) {

      craftingTableFound =
        false;


      const tableInfo =
        bot.registry.blocksByName[
          "crafting_table"
        ];


      if (tableInfo) {

        const radius =
          Math.max(
            1,
            Math.min(
              params.craftingTableRadius ??
                16,
              64
            )
          );


        const table =
          bot.findBlock({

            matching:
              tableInfo.id,

            maxDistance:
              radius
          });


        if (table) {

          craftingTableFound =
            true;


          craftingTablePosition = {

            x:
              table.position.x,

            y:
              table.position.y,

            z:
              table.position.z
          };
        }
      }
    }


    // =================================================
    // 6. 当前是否已经能直接 Craft
    // =================================================

    const materialsReady =
      missingMaterials.length ===
      0;


    const tableReady =
      !recipe.requiresCraftingTable ||
      craftingTableFound;


    const canCraftNow =
      materialsReady &&
      tableReady;


    // =================================================
    // 7. QUERY SUCCESS
    //
    // canCraftNow=false 不是错误。
    // 它只是查询出来当前条件不足。
    // =================================================

    return {

      skill:
        this.name,

      status:
        "SUCCESS",

      startedAt,

      finishedAt:
        Date.now(),

      data: {

        item:
          params.item,

        requested:
          amount,

        outputPerCraft:
          recipe.outputCount,

        craftOperations,

        actualOutput,

        requiresCraftingTable:
          recipe.requiresCraftingTable,

        craftingTableFound,

        craftingTablePosition,

        materialsReady,

        tableReady,

        canCraftNow,

        ingredients,

        missingMaterials
      }
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
}