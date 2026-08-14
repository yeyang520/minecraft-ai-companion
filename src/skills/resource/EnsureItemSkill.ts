import type {
  Skill,
  SkillContext,
  SkillResult,
  SkillFailureReason
} from "../Skill";

import {
  getCraftRecipe,
  hasCraftingKnowledge,
  type CraftIngredient
} from "../../knowledge/CraftingKnowledge";

import {
  getHarvestSources,
  hasHarvestKnowledge
} from "../../knowledge/HarvestKnowledge";

import {
  getPlankForLog,
  getResourceGroupMembers,
  type ResourceGroupName
} from "../../knowledge/ResourceGroups";

import {
  CraftItemSkill
} from "./CraftItemSkill";

import {
  CollectItemSkill
} from "./CollectItemSkill";


// =====================================================
// Public Params
//
// public ensure_item 仍然是精确 Item。
//
// 例如：
//
// ensure_item("stone_pickaxe", 1)
//
// Resource Group 只用于内部依赖。
// =====================================================

export interface EnsureItemParams {

  item: string;

  amount: number;

  craftingTableRadius?: number;

  resourceRadius?: number;
}


// =====================================================
// Context
// =====================================================

interface EnsureContext {

  depth: number;

  maxDepth: number;

  stack: string[];

  steps: EnsureStep[];
}


// =====================================================
// Step
// =====================================================

interface EnsureStep {

  type:
    | "CHECK"
    | "CHECK_GROUP"
    | "COLLECT"
    | "CRAFT"
    | "ENSURE_TOOL"
    | "SELECT_RESOURCE";

  item?: string;

  group?: ResourceGroupName;

  target?: number;

  amount?: number;

  result?: string;
}


// =====================================================
// Internal Result
// =====================================================

interface InternalEnsureResult {

  success: boolean;

  cancelled?: boolean;

  reason?: SkillFailureReason;

  data?: unknown;
}


// =====================================================
// EnsureItemSkill
// =====================================================

export class EnsureItemSkill
  implements Skill<EnsureItemParams> {

  readonly name =
    "ensure_item";


  readonly category =
    "ACTION" as const;


  private readonly crafter =
    new CraftItemSkill();


  private readonly collector =
    new CollectItemSkill();


  // ===================================================
  // Execute
  // ===================================================

  async execute(
    ctx: SkillContext,
    params: EnsureItemParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();


    const { bot } =
      ctx;


    // =================================================
    // 参数
    // =================================================

    if (
      !params.item ||
      !Number.isInteger(
        params.amount
      ) ||
      params.amount <= 0
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
    // Initial Inventory
    // =================================================

    const startCount =
      this.countItem(
        ctx,
        params.item
      );


    if (
      startCount >=
      params.amount
    ) {

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

          targetCount:
            params.amount,

          startCount,

          currentCount:
            startCount,

          missing:
            0,

          gained:
            0,

          alreadySatisfied:
            true
        },

        data: {

          steps: []
        }
      };
    }


    // =================================================
    // Recursive Context
    // =================================================

    const context:
      EnsureContext = {

      depth:
        0,

      maxDepth:
        14,

      stack:
        [],

      steps:
        []
    };


    // =================================================
    // Ensure
    // =================================================

    const result =
      await this.ensureItemInternal(

        ctx,

        params.item,

        params.amount,

        params,

        signal,

        context
      );


    const finalCount =
      this.countItem(
        ctx,
        params.item
      );


    // =================================================
    // Cancel
    // =================================================

    if (
      signal.aborted ||
      result.cancelled
    ) {

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

          targetCount:
            params.amount,

          startCount,

          currentCount:
            finalCount,

          missing:
            Math.max(
              0,
              params.amount -
              finalCount
            ),

          gained:
            Math.max(
              0,
              finalCount -
              startCount
            )
        },

        data: {

          steps:
            context.steps
        }
      };
    }


    // =================================================
    // Success
    // =================================================

    if (
      result.success &&
      finalCount >=
      params.amount
    ) {

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

          targetCount:
            params.amount,

          startCount,

          currentCount:
            finalCount,

          missing:
            0,

          gained:
            Math.max(
              0,
              finalCount -
              startCount
            ),

          alreadySatisfied:
            false
        },

        data: {

          steps:
            context.steps
        }
      };
    }


    // =================================================
    // Failed
    // =================================================

    return {

      skill:
        this.name,

      status:
        "FAILED",

      reason:
        result.reason ??
        "NO_PROGRESS",

      startedAt,

      finishedAt:
        Date.now(),

      progress: {

        item:
          params.item,

        targetCount:
          params.amount,

        startCount,

        currentCount:
          finalCount,

        missing:
          Math.max(
            0,
            params.amount -
            finalCount
          ),

        gained:
          Math.max(
            0,
            finalCount -
            startCount
          )
      },

      data: {

        failure:
          result.data,

        steps:
          context.steps
      }
    };
  }


  // ===================================================
  // Ensure Exact Item
  // ===================================================

  private async ensureItemInternal(
    ctx: SkillContext,
    item: string,
    targetCount: number,
    params: EnsureItemParams,
    signal: AbortSignal,
    context: EnsureContext
  ): Promise<InternalEnsureResult> {

    if (
      signal.aborted
    ) {

      return {

        success:
          false,

        cancelled:
          true
      };
    }


    const currentCount =
      this.countItem(
        ctx,
        item
      );


    context.steps.push({

      type:
        "CHECK",

      item,

      target:
        targetCount,

      result:
        `current=${currentCount}`
    });


    if (
      currentCount >=
      targetCount
    ) {

      return {

        success:
          true
      };
    }


    const key =
      `item:${item}`;


    if (
      context.depth >=
      context.maxDepth
    ) {

      return {

        success:
          false,

        reason:
          "PRECONDITION_MISSING",

        data: {

          item,

          error:
            "MAX_DEPENDENCY_DEPTH",

          stack:
            context.stack
        }
      };
    }


    if (
      context.stack.includes(
        key
      )
    ) {

      return {

        success:
          false,

        reason:
          "PRECONDITION_MISSING",

        data: {

          item,

          error:
            "DEPENDENCY_CYCLE",

          stack: [

            ...context.stack,

            key
          ]
        }
      };
    }


    const childContext =
      this.childContext(
        context,
        key
      );


    // =================================================
    // Craftable
    // =================================================

    if (
      hasCraftingKnowledge(
        item
      )
    ) {

      const recipe =
        getCraftRecipe(
          item
        )!;


      // ===============================================
      // 当前还差多少目标
      // ===============================================

      const missingTarget =
        Math.max(
          0,
          targetCount -
          currentCount
        );


      const craftOperations =
        Math.ceil(
          missingTarget /
          recipe.outputCount
        );


      // ===============================================
      // 多轮校验 Ingredients
      //
      // 因为制作一个 Ingredient
      // 可能消耗另外一个 Ingredient。
      // ===============================================

      const maxPasses =
        8;


      let ingredientsReady =
        false;


      for (
        let pass = 0;
        pass < maxPasses;
        pass++
      ) {

        if (
          signal.aborted
        ) {

          return {

            success:
              false,

            cancelled:
              true
          };
        }


        for (
          const ingredient
          of recipe.ingredients
        ) {

          const required =
            ingredient.count *
            craftOperations;


          const available =
            this.countIngredient(
              ctx,
              ingredient
            );


          if (
            available >=
            required
          ) {

            continue;
          }


          const result =
            await this.ensureIngredient(

              ctx,

              ingredient,

              required,

              params,

              signal,

              childContext
            );


          if (
            result.cancelled
          ) {

            return result;
          }


          if (
            !result.success
          ) {

            return {

              success:
                false,

              reason:
                result.reason,

              data: {

                item,

                ingredient,

                cause:
                  result.data
              }
            };
          }
        }


        ingredientsReady =
          recipe.ingredients.every(
            ingredient => {

              const required =
                ingredient.count *
                craftOperations;


              return (
                this.countIngredient(
                  ctx,
                  ingredient
                ) >=
                required
              );
            }
          );


        if (
          ingredientsReady
        ) {

          break;
        }
      }


      if (
        !ingredientsReady
      ) {

        return {

          success:
            false,

          reason:
            "PRECONDITION_MISSING",

          data: {

            item,

            error:
              "INGREDIENTS_NOT_STABLE"
          }
        };
      }


      // ===============================================
      // 工作台
      //
      // 当前仍然要求已经放在附近。
      // 下一 Milestone 再自动制作 + 放置。
      // ===============================================

      if (
        recipe.requiresCraftingTable
      ) {

        const tableInfo =
          ctx.bot.registry
            .blocksByName[
              "crafting_table"
            ];


        const table =
          tableInfo
            ? ctx.bot.findBlock({

                matching:
                  tableInfo.id,

                maxDistance:
                  params
                    .craftingTableRadius ??
                  16
              })

            : null;


        if (!table) {

          return {

            success:
              false,

            reason:
              "PRECONDITION_MISSING",

            data: {

              item,

              error:
                "CRAFTING_TABLE_NOT_FOUND"
            }
          };
        }
      }


      // ===============================================
      // Final amount
      // ===============================================

      const beforeCraft =
        this.countItem(
          ctx,
          item
        );


      const amountToCraft =
        Math.max(
          0,
          targetCount -
          beforeCraft
        );


      if (
        amountToCraft <= 0
      ) {

        return {

          success:
            true
        };
      }


      context.steps.push({

        type:
          "CRAFT",

        item,

        amount:
          amountToCraft
      });


      const craftResult =
        await this.crafter.execute(

          ctx,

          {

            item,

            amount:
              amountToCraft,

            craftingTableRadius:
              params
                .craftingTableRadius
          },

          signal
        );


      if (
        signal.aborted ||
        craftResult.status ===
          "CANCELLED"
      ) {

        return {

          success:
            false,

          cancelled:
            true
        };
      }


      if (
        craftResult.status ===
        "FAILED"
      ) {

        return {

          success:
            false,

          reason:
            craftResult.reason ??
            "CRAFT_FAILED",

          data: {

            item,

            action:
              "CRAFT",

            result:
              craftResult
          }
        };
      }


      const afterCraft =
        this.countItem(
          ctx,
          item
        );


      return {

        success:
          afterCraft >=
          targetCount,

        reason:
          afterCraft >=
          targetCount
            ? undefined
            : "NO_PROGRESS",

        data:
          afterCraft >=
          targetCount
            ? undefined
            : {

                item,

                expected:
                  targetCount,

                actual:
                  afterCraft
              }
      };
    }


    // =================================================
    // Harvestable
    // =================================================

    if (
      hasHarvestKnowledge(
        item
      )
    ) {

      const missing =
        Math.max(
          0,
          targetCount -
          currentCount
        );


      context.steps.push({

        type:
          "COLLECT",

        item,

        amount:
          missing
      });


      let collectResult =
        await this.collector.execute(

          ctx,

          {

            item,

            amount:
              missing,

            radius:
              params
                .resourceRadius ??
              32
          },

          signal
        );


      // ===============================================
      // Tool Missing
      // ===============================================

      if (
        collectResult.status ===
          "FAILED" &&
        collectResult.reason ===
          "TOOL_MISSING"
      ) {

        const requiredTool =
          this.getRequiredHarvestTool(
            item
          );


        if (!requiredTool) {

          return {

            success:
              false,

            reason:
              "TOOL_MISSING",

            data: {

              item,

              error:
                "REQUIRED_TOOL_UNKNOWN"
            }
          };
        }


        context.steps.push({

          type:
            "ENSURE_TOOL",

          item:
            requiredTool,

          target:
            1
        });


        const toolResult =
          await this.ensureItemInternal(

            ctx,

            requiredTool,

            1,

            params,

            signal,

            childContext
          );


        if (
          !toolResult.success
        ) {

          return toolResult;
        }


        const remaining =
          Math.max(
            0,
            targetCount -
            this.countItem(
              ctx,
              item
            )
          );


        if (
          remaining <= 0
        ) {

          return {

            success:
              true
          };
        }


        context.steps.push({

          type:
            "COLLECT",

          item,

          amount:
            remaining,

          result:
            "retry_after_tool"
        });


        collectResult =
          await this.collector.execute(

            ctx,

            {

              item,

              amount:
                remaining,

              radius:
                params
                  .resourceRadius ??
                32
            },

            signal
          );
      }


      if (
        signal.aborted ||
        collectResult.status ===
          "CANCELLED"
      ) {

        return {

          success:
            false,

          cancelled:
            true
        };
      }


      if (
        collectResult.status ===
        "FAILED"
      ) {

        return {

          success:
            false,

          reason:
            collectResult.reason ??
            "UNKNOWN",

          data: {

            item,

            action:
              "COLLECT",

            result:
              collectResult
          }
        };
      }


      const afterCollect =
        this.countItem(
          ctx,
          item
        );


      return {

        success:
          afterCollect >=
          targetCount,

        reason:
          afterCollect >=
          targetCount
            ? undefined
            : "NO_PROGRESS"
      };
    }


    // =================================================
    // Unknown
    // =================================================

    return {

      success:
        false,

      reason:
        "PRECONDITION_MISSING",

      data: {

        item,

        error:
          "NO_ACQUISITION_KNOWLEDGE"
      }
    };
  }


  // ===================================================
  // Ensure Ingredient
  // ===================================================

  private async ensureIngredient(
    ctx: SkillContext,
    ingredient: CraftIngredient,
    required: number,
    params: EnsureItemParams,
    signal: AbortSignal,
    context: EnsureContext
  ): Promise<InternalEnsureResult> {

    if (
      ingredient.kind ===
      "item"
    ) {

      return this.ensureItemInternal(

        ctx,

        ingredient.item,

        required,

        params,

        signal,

        context
      );
    }


    return this.ensureGroupInternal(

      ctx,

      ingredient.group,

      required,

      params,

      signal,

      context
    );
  }


  // ===================================================
  // Ensure Resource Group
  // ===================================================

  private async ensureGroupInternal(
    ctx: SkillContext,
    group: ResourceGroupName,
    targetCount: number,
    params: EnsureItemParams,
    signal: AbortSignal,
    context: EnsureContext
  ): Promise<InternalEnsureResult> {

    const currentCount =
      this.countGroup(
        ctx,
        group
      );


    context.steps.push({

      type:
        "CHECK_GROUP",

      group,

      target:
        targetCount,

      result:
        `current=${currentCount}`
    });


    if (
      currentCount >=
      targetCount
    ) {

      return {

        success:
          true
      };
    }


    const key =
      `group:${group}`;


    if (
      context.stack.includes(
        key
      )
    ) {

      return {

        success:
          false,

        reason:
          "PRECONDITION_MISSING",

        data: {

          group,

          error:
            "GROUP_DEPENDENCY_CYCLE"
        }
      };
    }


    const childContext =
      this.childContext(
        context,
        key
      );


    // =================================================
    // ANY_LOG
    //
    // 找附近实际存在的树。
    // =================================================

    if (
      group ===
      "ANY_LOG"
    ) {

      const missing =
        targetCount -
        currentCount;


      const selected =
        this.findNearestHarvestableGroupMember(

          ctx,

          group,

          params.resourceRadius ??
            32
        );


      if (!selected) {

        return {

          success:
            false,

          reason:
            "RESOURCE_NOT_FOUND",

          data: {

            group,

            error:
              "NO_GROUP_MEMBER_FOUND"
          }
        };
      }


      context.steps.push({

        type:
          "SELECT_RESOURCE",

        group,

        item:
          selected,

        amount:
          missing
      });


      const selectedCurrent =
        this.countItem(
          ctx,
          selected
        );


      return this.ensureItemInternal(

        ctx,

        selected,

        selectedCurrent +
          missing,

        params,

        signal,

        childContext
      );
    }


    // =================================================
    // ANY_PLANK
    //
    // 逻辑：
    //
    // 1. 已有任意木板就直接算
    //
    // 2. 不够：
    //    确保有足够任意原木
    //
    // 3. 看背包实际上是哪种 log
    //
    // 4. 转换成对应 planks
    // =================================================

    if (
      group ===
      "ANY_PLANK"
    ) {

      let guard =
        0;


      while (
        this.countGroup(
          ctx,
          group
        ) <
        targetCount
      ) {

        guard++;


        if (
          guard > 16
        ) {

          return {

            success:
              false,

            reason:
              "NO_PROGRESS",

            data: {

              group,

              error:
                "GROUP_ACQUISITION_GUARD"
            }
          };
        }


        if (
          signal.aborted
        ) {

          return {

            success:
              false,

            cancelled:
              true
          };
        }


        const plankCount =
          this.countGroup(
            ctx,
            "ANY_PLANK"
          );


        const missingPlanks =
          targetCount -
          plankCount;


        // ===============================================
        // 找背包里的任意原木
        // ===============================================

        let selectedLog =
          this.findInventoryGroupMember(
            ctx,
            "ANY_LOG"
          );


        // ===============================================
        // 没原木：
        // 先确保 ANY_LOG
        // ===============================================

        if (!selectedLog) {

          const requiredLogs =
            Math.ceil(
              missingPlanks /
              4
            );


          const currentLogs =
            this.countGroup(
              ctx,
              "ANY_LOG"
            );


          const logResult =
            await this.ensureGroupInternal(

              ctx,

              "ANY_LOG",

              currentLogs +
                requiredLogs,

              params,

              signal,

              childContext
            );


          if (
            !logResult.success
          ) {

            return logResult;
          }


          selectedLog =
            this.findInventoryGroupMember(
              ctx,
              "ANY_LOG"
            );
        }


        if (!selectedLog) {

          return {

            success:
              false,

            reason:
              "NO_PROGRESS",

            data: {

              group,

              error:
                "LOG_ACQUIRED_BUT_NOT_FOUND_IN_INVENTORY"
            }
          };
        }


        const plank =
          getPlankForLog(
            selectedLog
          );


        if (!plank) {

          return {

            success:
              false,

            reason:
              "PRECONDITION_MISSING",

            data: {

              group,

              selectedLog,

              error:
                "NO_LOG_TO_PLANK_MAPPING"
            }
          };
        }


        const logCount =
          this.countItem(
            ctx,
            selectedLog
          );


        const maxOutput =
          logCount *
          4;


        const craftAmount =
          Math.min(
            missingPlanks,
            maxOutput
          );


        context.steps.push({

          type:
            "CRAFT",

          item:
            plank,

          amount:
            craftAmount,

          result:
            `from=${selectedLog}`
        });


        const craftResult =
          await this.crafter.execute(

            ctx,

            {

              item:
                plank,

              amount:
                craftAmount,

              craftingTableRadius:
                params
                  .craftingTableRadius
            },

            signal
          );


        if (
          signal.aborted ||
          craftResult.status ===
            "CANCELLED"
        ) {

          return {

            success:
              false,

            cancelled:
              true
          };
        }


        if (
          craftResult.status ===
          "FAILED"
        ) {

          return {

            success:
              false,

            reason:
              craftResult.reason ??
              "CRAFT_FAILED",

            data: {

              group,

              selectedLog,

              plank,

              result:
                craftResult
            }
          };
        }
      }


      return {

        success:
          true
      };
    }


    return {

      success:
        false,

      reason:
        "PRECONDITION_MISSING",

      data: {

        group,

        error:
          "NO_GROUP_ACQUISITION_STRATEGY"
      }
    };
  }


  // ===================================================
  // Find nearest Harvestable member
  //
  // ANY_LOG：
  //
  // oak_log?
  // birch_log?
  // spruce_log?
  //
  // 谁离 MAC 最近就选谁。
  // ===================================================

  private findNearestHarvestableGroupMember(
    ctx: SkillContext,
    group: ResourceGroupName,
    radius: number
  ): string | null {

    const { bot } =
      ctx;


    const members =
      getResourceGroupMembers(
        group
      );


    let bestItem:
      string | null =
      null;


    let bestDistance =
      Number.POSITIVE_INFINITY;


    for (
      const item
      of members
    ) {

      if (
        !bot.registry.itemsByName[
          item
        ]
      ) {

        continue;
      }


      const sources =
        getHarvestSources(
          item
        );


      for (
        const source
        of sources
      ) {

        const blockInfo =
          bot.registry
            .blocksByName[
              source.block
            ];


        if (!blockInfo) {

          continue;
        }


        const block =
          bot.findBlock({

            matching:
              blockInfo.id,

            maxDistance:
              radius
          });


        if (!block) {

          continue;
        }


        const distance =
          bot.entity.position
            .distanceTo(
              block.position
            );


        if (
          distance <
          bestDistance
        ) {

          bestDistance =
            distance;


          bestItem =
            item;
        }
      }
    }


    return bestItem;
  }


  // ===================================================
  // 找 Inventory 中数量最多的 Group Member
  // ===================================================

  private findInventoryGroupMember(
    ctx: SkillContext,
    group: ResourceGroupName
  ): string | null {

    const members =
      getResourceGroupMembers(
        group
      );


    let best:
      string | null =
      null;


    let bestCount =
      0;


    for (
      const member
      of members
    ) {

      const count =
        this.countItem(
          ctx,
          member
        );


      if (
        count >
        bestCount
      ) {

        bestCount =
          count;


        best =
          member;
      }
    }


    return best;
  }


  // ===================================================
  // Count Ingredient
  // ===================================================

  private countIngredient(
    ctx: SkillContext,
    ingredient: CraftIngredient
  ): number {

    if (
      ingredient.kind ===
      "item"
    ) {

      return this.countItem(
        ctx,
        ingredient.item
      );
    }


    return this.countGroup(
      ctx,
      ingredient.group
    );
  }


  // ===================================================
  // Count Group
  // ===================================================

  private countGroup(
    ctx: SkillContext,
    group: ResourceGroupName
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


  // ===================================================
  // Count Exact Item
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
  // Harvest Tool
  // ===================================================

  private getRequiredHarvestTool(
    item: string
  ): string | null {

    const sources =
      getHarvestSources(
        item
      );


    for (
      const source
      of sources
    ) {

      if (
        !source.requiredTool
      ) {

        continue;
      }


      return (
        `${source.requiredTool.minTier}_${source.requiredTool.type}`
      );
    }


    return null;
  }


  // ===================================================
  // Child Context
  // ===================================================

  private childContext(
    context: EnsureContext,
    key: string
  ): EnsureContext {

    return {

      depth:
        context.depth + 1,

      maxDepth:
        context.maxDepth,

      stack: [

        ...context.stack,

        key
      ],

      steps:
        context.steps
    };
  }
}