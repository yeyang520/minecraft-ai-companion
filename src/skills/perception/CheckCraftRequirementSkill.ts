import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getCraftRecipe
} from "../../knowledge/CraftingKnowledge";

import {
  getResourceGroupMembers
} from "../../knowledge/ResourceGroups";


// =====================================================
// Params
// =====================================================

export interface CheckCraftRequirementParams {

  item: string;

  amount?: number;

  craftingTableRadius?: number;
}


// =====================================================
// Skill
// =====================================================

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


    const amount =
      params.amount ??
      1;


    // =================================================
    // 参数
    // =================================================

    if (
      !params.item ||
      !Number.isInteger(
        amount
      ) ||
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


    const recipe =
      getCraftRecipe(
        params.item
      );


    if (!recipe) {

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
            "NO_CRAFTING_KNOWLEDGE"
        }
      };
    }


    // =================================================
    // Craft 次数
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
    // Ingredients
    // =================================================

    const ingredients =
      recipe.ingredients.map(
        ingredient => {

          const required =
            ingredient.count *
            craftOperations;


          // =============================================
          // 精确 Item
          // =============================================

          if (
            ingredient.kind ===
            "item"
          ) {

            const available =
              this.countItem(
                ctx,
                ingredient.item
              );


            return {

              kind:
                "item",

              item:
                ingredient.item,

              required,

              available,

              missing:
                Math.max(
                  0,
                  required -
                  available
                )
            };
          }


          // =============================================
          // Resource Group
          // =============================================

          const available =
            this.countGroup(
              ctx,
              ingredient.group
            );


          return {

            kind:
              "group",

            group:
              ingredient.group,

            members:
              getResourceGroupMembers(
                ingredient.group
              ),

            required,

            available,

            missing:
              Math.max(
                0,
                required -
                available
              )
          };
        }
      );


    const missingMaterials =
      ingredients.filter(
        ingredient =>
          ingredient.missing >
          0
      );


    // =================================================
    // Crafting Table
    // =================================================

    let craftingTableFound =
      true;


    let craftingTablePosition:
      {
        x: number;
        y: number;
        z: number;
      } | null =
      null;


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

        const table =
          bot.findBlock({

            matching:
              tableInfo.id,

            maxDistance:
              params
                .craftingTableRadius ??
              16
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


    const materialsReady =
      missingMaterials.length ===
      0;


    const tableReady =
      !recipe.requiresCraftingTable ||
      craftingTableFound;


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

        canCraftNow:
          materialsReady &&
          tableReady,

        ingredients,

        missingMaterials
      }
    };
  }


  // ===================================================
  // Exact Item Count
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
  // Group Count
  //
  // 例如：
  //
  // birch_planks = 2
  // spruce_planks = 3
  //
  // ANY_PLANK = 5
  // ===================================================

  private countGroup(
    ctx: SkillContext,
    group:
      "ANY_LOG" |
      "ANY_PLANK"
  ): number {

    const members =
      getResourceGroupMembers(
        group
      );


    return ctx.bot.inventory
      .items()
      .filter(
        item =>
          members.includes(
            item.name as never
          )
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