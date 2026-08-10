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


export interface CheckHarvestToolParams {
  item: string;
}


export class CheckHarvestToolSkill
  implements Skill<CheckHarvestToolParams> {

  readonly name =
    "check_harvest_tool";

  readonly category =
    "QUERY" as const;


  async execute(
    ctx: SkillContext,
    params: CheckHarvestToolParams,
    _signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();

    const { bot } =
      ctx;


    // =================================================
    // 1. Knowledge
    // =================================================

    if (
      !hasHarvestKnowledge(
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
            "HARVEST_KNOWLEDGE_NOT_FOUND"
        }
      };
    }


    const sources =
      getHarvestSources(
        params.item
      );


    const inventoryItems =
      bot.inventory.items();


    // =================================================
    // 2. 检查每一种来源
    // =================================================

    const results =
      sources.map(
        source => {

          // ============================================
          // 不需要工具
          // ============================================

          if (
            !source.requiredTool
          ) {

            return {

              block:
                source.block,

              expectedItem:
                source.expectedItem,

              requiresTool:
                false,

              capable:
                true,

              selectedTool:
                null
            };
          }


          // ============================================
          // 找满足要求的工具
          // ============================================

          const tool =
            inventoryItems.find(
              item =>
                toolMeetsRequirement(
                  item.name,
                  source.requiredTool!
                )
            );


          return {

            block:
              source.block,

            expectedItem:
              source.expectedItem,

            requiresTool:
              true,

            requiredTool:
              source.requiredTool,

            capable:
              tool !==
              undefined,

            selectedTool:
              tool?.name ??
              null
          };
        }
      );


    // =================================================
    // 3. 只要任意来源可采集，就说明具备能力
    // =================================================

    const capable =
      results.some(
        result =>
          result.capable
      );


    const usableSource =
      results.find(
        result =>
          result.capable
      ) ??
      null;


    // =================================================
    // 4. QUERY 成功
    //
    // capable=false 不是 FAILED。
    //
    // 查询正常完成，只是当前没有工具。
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

        capable,

        usableSource,

        sources:
          results
      }
    };
  }
}