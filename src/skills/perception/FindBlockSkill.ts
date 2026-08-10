import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";


export interface FindBlockParams {

  block: string;

  radius?: number;

  maxResults?: number;
}


export class FindBlockSkill
  implements Skill<FindBlockParams> {

  readonly name =
    "find_block";

  readonly category =
    "QUERY" as const;


  async execute(
    ctx: SkillContext,
    params: FindBlockParams,
    _signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();

    const { bot } = ctx;

    const radius =
      Math.max(
        1,
        params.radius ?? 16
      );

    const maxResults =
      Math.max(
        1,
        Math.min(
          params.maxResults ?? 5,
          32
        )
      );

    // ==============================
    // 1. 查询当前 MC 版本中的方块
    // ==============================

    const blockInfo =
      bot.registry.blocksByName[
        params.block
      ];

    if (!blockInfo) {

      return {
        skill: this.name,

        status: "FAILED",

        reason: "UNKNOWN",

        startedAt,

        finishedAt:
          Date.now(),

        data: {
          block:
            params.block,

          error:
            "BLOCK_TYPE_NOT_FOUND"
        }
      };
    }

    // ==============================
    // 2. 搜索附近方块
    // ==============================

    const positions =
      bot.findBlocks({

        matching:
          blockInfo.id,

        maxDistance:
          radius,

        count:
          maxResults
      });

    // ==============================
    // 3. 转换为稳定 JSON 数据
    // ==============================

    const blocks =
      positions.map(
        position => ({

          x: position.x,

          y: position.y,

          z: position.z,

          distance:
            Number(
              bot.entity.position
                .distanceTo(position)
                .toFixed(3)
            )
        })
      );

    return {

      skill: this.name,

      status: "SUCCESS",

      startedAt,

      finishedAt:
        Date.now(),

      data: {

        block:
          params.block,

        found:
          blocks.length > 0,

        count:
          blocks.length,

        radius,

        blocks
      }
    };
  }
}