import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";

import {
  getHarvestSources,
  hasHarvestKnowledge
} from "../../knowledge/HarvestKnowledge";


export interface FindHarvestSourceParams {
  item: string;
  radius?: number;
  maxResults?: number;
}


export class FindHarvestSourceSkill
  implements Skill<FindHarvestSourceParams> {

  readonly name =
    "find_harvest_source";

  readonly category =
    "QUERY" as const;


  async execute(
    ctx: SkillContext,
    params: FindHarvestSourceParams,
    _signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();

    const { bot } = ctx;


    // ==============================
    // 1. 是否认识这个物品
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


    const maxResults =
      Math.max(
        1,
        Math.min(
          params.maxResults ?? 5,
          16
        )
      );


    // ==============================
    // 2. 获得候选来源
    // ==============================

    const sources =
      getHarvestSources(
        params.item
      );


    // ==============================
    // 3. 按知识中的优先顺序搜索
    // ==============================

    for (
      const source
      of sources
    ) {

      const blockInfo =
        bot.registry.blocksByName[
          source.block
        ];


      if (!blockInfo) {
        continue;
      }


      const positions =
        bot.findBlocks({

          matching:
            blockInfo.id,

          maxDistance:
            radius,

          count:
            maxResults
        });


      if (
        positions.length === 0
      ) {
        continue;
      }


      const blocks =
        positions.map(
          position => ({

            x:
              position.x,

            y:
              position.y,

            z:
              position.z,

            distance:
              Number(
                bot.entity.position
                  .distanceTo(
                    position
                  )
                  .toFixed(3)
              )
          })
        );


      // ==============================
      // 找到第一个优先来源
      // ==============================

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

          found:
            true,

          sourceBlock:
            source.block,

          expectedItem:
            source.expectedItem,

          radius,

          blocks
        }
      };
    }


    // ==============================
    // 4. 查询成功，但是附近没有来源
    // ==============================

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

        found:
          false,

        radius,

        sources
      }
    };
  }
}