import { goals } from "mineflayer-pathfinder";

import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";


export interface CollectBlockParams {
  block: string;
  amount: number;

  // 实际希望进入 MAC 背包的物品。
  // 不填写时默认和 block 相同。
  expectedItem?: string;

  radius?: number;
  maxCandidates?: number;
}


export class CollectBlockSkill
  implements Skill<CollectBlockParams> {

  readonly name = "collect_block";
  readonly category = "ACTION" as const;


  async execute(
    ctx: SkillContext,
    params: CollectBlockParams,
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
        0
      );
    }


    const blockInfo =
      bot.registry.blocksByName[
        params.block
      ];


    if (!blockInfo) {
      return this.failed(
        startedAt,
        "INVALID_ARGUMENT",
        params,
        0,
        0
      );
    }


    const expectedItem =
      params.expectedItem ??
      params.block;


    if (
      !bot.registry.itemsByName[
        expectedItem
      ]
    ) {
      return this.failed(
        startedAt,
        "INVALID_ARGUMENT",
        params,
        0,
        0,
        expectedItem
      );
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
    // 2. 记录开始库存
    // =================================================

    const startCount =
      this.countItem(
        bot,
        expectedItem
      );


    const targetCount =
      startCount +
      params.amount;


    let blocksBroken = 0;


    // =================================================
    // 3. Cancel
    // =================================================

    const onAbort = () => {
      bot.stopDigging();
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
    };


    signal.addEventListener(
      "abort",
      onAbort
    );


    try {

      // =================================================
      // 4. 一直采集到 Inventory 达到目标
      // =================================================

      while (
        this.countItem(
          bot,
          expectedItem
        ) < targetCount
      ) {

        // ===============================================
        // 4.1 Cancel
        // ===============================================

        if (signal.aborted) {
          return this.cancelled(
            startedAt,
            params,
            startCount,
            blocksBroken,
            expectedItem,
            bot
          );
        }


        // ===============================================
        // 4.2 背包检查
        // ===============================================

        if (
          !this.hasRoomForItem(
            bot,
            expectedItem
          )
        ) {
          return this.failed(
            startedAt,
            "INVENTORY_FULL",
            params,
            startCount,
            blocksBroken,
            expectedItem,
            bot
          );
        }


        // ===============================================
        // 4.3 搜索候选方块
        // ===============================================

        const positions =
          bot.findBlocks({

            matching:
              blockInfo.id,

            maxDistance:
              radius,

            count:
              maxCandidates
          });


        if (
          positions.length === 0
        ) {
          return this.failed(
            startedAt,
            "RESOURCE_NOT_FOUND",
            params,
            startCount,
            blocksBroken,
            expectedItem,
            bot
          );
        }


        let collectedThisRound = false;
        let pathFailed = false;
        let reachableCandidate = false;

        // 本轮是否发生：
        // MAC 挖出来了，但被其他玩家/实体捡走。
        let dropTakenByOtherThisRound = false;


        // ===============================================
        // 4.4 尝试候选
        // ===============================================

        for (
          const position
          of positions
        ) {

          if (signal.aborted) {
            return this.cancelled(
              startedAt,
              params,
              startCount,
              blocksBroken,
              expectedItem,
              bot
            );
          }


          // =============================================
          // 不挖自己正脚下
          // =============================================

          if (
            this.isDirectlyBelowBot(
              bot,
              position
            )
          ) {
            continue;
          }


          // =============================================
          // 重新获取真实世界方块
          // =============================================

          let block =
            bot.blockAt(
              position
            );


          if (
            !block ||
            block.name !==
              params.block
          ) {
            continue;
          }


          // =============================================
          // 当前够不到或者看不到时才寻路
          // =============================================

          if (
            !bot.canDigBlock(block) ||
            !bot.canSeeBlock(block)
          ) {

            try {

              await bot.pathfinder.goto(

                new goals.GoalNear(
                  position.x,
                  position.y,
                  position.z,
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
                  blocksBroken,
                  expectedItem,
                  bot
                );
              }


              pathFailed = true;

              continue;
            }


            // 寻路结束后必须重新读取
            block =
              bot.blockAt(
                position
              );


            if (
              !block ||
              block.name !==
                params.block
            ) {
              continue;
            }
          }


          // =============================================
          // 靠近后再次验证可见、可挖
          // =============================================

          if (
            !bot.canDigBlock(block) ||
            !bot.canSeeBlock(block)
          ) {
            continue;
          }


          reachableCandidate = true;


          // =============================================
          // 自动装备当前最佳工具
          // =============================================

          const bestTool =
            bot.pathfinder
              .bestHarvestTool(
                block
              );


          if (bestTool) {
            await bot.equip(
              bestTool,
              "hand"
            );
          }


          if (signal.aborted) {
            return this.cancelled(
              startedAt,
              params,
              startCount,
              blocksBroken,
              expectedItem,
              bot
            );
          }


          // =============================================
          // 挖之前的 Inventory
          // =============================================

          const beforeCount =
            this.countItem(
              bot,
              expectedItem
            );


          // =============================================
          // 记录这次挖掘产生的掉落物
          // =============================================

          const drops:
            Array<typeof bot.entity> = [];


          const dropIds =
            new Set<number>();


          let collectedByOther =
            false;


          const blockCenter =
            block.position.offset(
              0.5,
              0.5,
              0.5
            );


          // =============================================
          // itemDrop
          // =============================================

          const onItemDrop = (
            entity: typeof bot.entity
          ) => {

            // 只记录刚才方块附近产生的掉落物
            if (
              entity.position
                .distanceTo(
                  blockCenter
                ) <= 3
            ) {

              drops.push(
                entity
              );


              dropIds.add(
                entity.id
              );
            }
          };


          // =============================================
          // playerCollect
          //
          // 判断是不是别人把 MAC 刚挖出来的东西捡走。
          // =============================================

          const onPlayerCollect = (
            collector: typeof bot.entity,
            collected: typeof bot.entity
          ) => {

            // 与这次挖掘无关
            if (
              !dropIds.has(
                collected.id
              )
            ) {
              return;
            }


            // MAC 自己捡到
            if (
              collector.id ===
              bot.entity.id
            ) {
              return;
            }


            // 被其他玩家/实体捡走
            collectedByOther =
              true;


            dropTakenByOtherThisRound =
              true;
          };


          bot.on(
            "itemDrop",
            onItemDrop
          );


          bot.on(
            "playerCollect",
            onPlayerCollect
          );


          // =============================================
          // 正式挖掘
          // =============================================

          try {

            await bot.dig(
              block,
              true
            );


            blocksBroken++;


            // 等待掉落实体生成
            await bot.waitForTicks(
              8
            );
          }
          catch {

            bot.off(
              "itemDrop",
              onItemDrop
            );


            bot.off(
              "playerCollect",
              onPlayerCollect
            );


            if (signal.aborted) {
              return this.cancelled(
                startedAt,
                params,
                startCount,
                blocksBroken,
                expectedItem,
                bot
              );
            }


            continue;
          }


          // 掉落实体已经生成完毕，
          // 不再需要继续监听新的 itemDrop。
          bot.off(
            "itemDrop",
            onItemDrop
          );


          // =============================================
          // 可能 MAC 本来就站得很近，
          // 掉落物已经自动进入 Inventory。
          // =============================================

          let afterCount =
            this.countItem(
              bot,
              expectedItem
            );


          if (
            afterCount >
            beforeCount
          ) {

            collectedThisRound =
              true;


            bot.off(
              "playerCollect",
              onPlayerCollect
            );


            break;
          }


          // =============================================
          // 主动走向掉落物
          // =============================================

          for (
            const drop
            of drops
          ) {

            if (signal.aborted) {

              bot.off(
                "playerCollect",
                onPlayerCollect
              );


              return this.cancelled(
                startedAt,
                params,
                startCount,
                blocksBroken,
                expectedItem,
                bot
              );
            }


            // 可能已经被别人捡走
            if (!drop.isValid) {
              continue;
            }


            const dropPosition =
              drop.position.clone();


            try {

              const distance =
                bot.entity.position
                  .distanceTo(
                    dropPosition
                  );


              if (
                distance >
                1.2
              ) {

                await bot.pathfinder.goto(

                  new goals.GoalNear(
                    Math.floor(
                      dropPosition.x
                    ),
                    Math.floor(
                      dropPosition.y
                    ),
                    Math.floor(
                      dropPosition.z
                    ),
                    1
                  )
                );
              }
            }
            catch {

              // 某一个掉落物走不到，
              // 这里不立刻结束 Skill。
            }


            // 给碰撞拾取和库存同步一点时间
            await bot.waitForTicks(
              6
            );


            afterCount =
              this.countItem(
                bot,
                expectedItem
              );


            if (
              afterCount >
              beforeCount
            ) {

              collectedThisRound =
                true;

              break;
            }
          }


          // =============================================
          // 最后再等待一次服务器同步
          // =============================================

          if (
            !collectedThisRound
          ) {

            await bot.waitForTicks(
              10
            );


            afterCount =
              this.countItem(
                bot,
                expectedItem
              );


            if (
              afterCount >
              beforeCount
            ) {
              collectedThisRound =
                true;
            }
          }


          // 现在可以安全移除拾取监听
          bot.off(
            "playerCollect",
            onPlayerCollect
          );


          // =============================================
          // 成功得到物品
          // =============================================

          if (
            collectedThisRound
          ) {
            break;
          }


          // =============================================
          // 掉落物被别人拿走
          //
          // 注意：
          // 不报 NO_PROGRESS。
          // 只是这一块没有给 MAC 增加库存。
          // 继续尝试其他方块。
          // =============================================

          if (
            collectedByOther
          ) {

            console.log(
              `[SKILL collect_block] drop from ${params.block} was collected by another entity, trying another block`
            );


            continue;
          }


          // =============================================
          // 真挖了、没人抢，
          // 但是预期物品仍然没有进入背包。
          // =============================================

          return this.failed(
            startedAt,
            "NO_PROGRESS",
            params,
            startCount,
            blocksBroken,
            expectedItem,
            bot
          );
        }


        // ===============================================
        // 4.5 如果本轮资源被别人抢走
        //
        // 重新搜索新资源。
        // ===============================================

        if (
          !collectedThisRound &&
          dropTakenByOtherThisRound
        ) {
          continue;
        }


        // ===============================================
        // 4.6 所有候选都失败
        // ===============================================

        if (
          !collectedThisRound
        ) {

          return this.failed(
            startedAt,

            pathFailed
              ? "PATH_NOT_FOUND"
              : reachableCandidate
                ? "NO_PROGRESS"
                : "TARGET_NOT_ACCESSIBLE",

            params,
            startCount,
            blocksBroken,
            expectedItem,
            bot
          );
        }
      }


      // =================================================
      // 5. 最终 Inventory Verifier
      // =================================================

      const currentCount =
        this.countItem(
          bot,
          expectedItem
        );


      const collected =
        currentCount -
        startCount;


      if (
        collected <
        params.amount
      ) {
        return this.failed(
          startedAt,
          "NO_PROGRESS",
          params,
          startCount,
          blocksBroken,
          expectedItem,
          bot
        );
      }


      // =================================================
      // 6. SUCCESS
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

          block:
            params.block,

          expectedItem,

          requested:
            params.amount,

          collected,

          blocksBroken,

          startCount,

          currentCount
        }
      };
    }
    catch (error) {

      if (signal.aborted) {
        return this.cancelled(
          startedAt,
          params,
          startCount,
          blocksBroken,
          expectedItem,
          bot
        );
      }


      console.error(
        "[SKILL collect_block] unexpected error:",
        error
      );


      return this.failed(
        startedAt,
        "UNKNOWN",
        params,
        startCount,
        blocksBroken,
        expectedItem,
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
  // 是否为 MAC 自己正脚下的方块
  // ===================================================

  private isDirectlyBelowBot(
    bot: SkillContext["bot"],
    position: {
      x: number;
      y: number;
      z: number;
    }
  ): boolean {

    const botX =
      Math.floor(
        bot.entity.position.x
      );


    const botY =
      Math.floor(
        bot.entity.position.y
      );


    const botZ =
      Math.floor(
        bot.entity.position.z
      );


    return (
      position.x === botX &&
      position.z === botZ &&
      position.y < botY
    );
  }


  // ===================================================
  // 统计 Inventory 中某个 Item 的真实数量
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
  // Inventory 是否还有空间
  // ===================================================

  private hasRoomForItem(
    bot: SkillContext["bot"],
    itemName: string
  ): boolean {

    const items =
      bot.inventory.items();


    // 已有同类型但堆叠还没满
    const partialStack =
      items.some(
        item =>
          item.name ===
            itemName &&
          item.count <
            item.stackSize
      );


    if (
      partialStack
    ) {
      return true;
    }


    // 主背包 + 快捷栏一共 36 格
    return (
      items.length <
      36
    );
  }


  // ===================================================
  // CANCELLED
  // ===================================================

  private cancelled(
    startedAt: number,
    params: CollectBlockParams,
    startCount: number,
    blocksBroken: number,
    expectedItem: string,
    bot: SkillContext["bot"]
  ): SkillResult {

    const currentCount =
      this.countItem(
        bot,
        expectedItem
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

        block:
          params.block,

        expectedItem,

        requested:
          params.amount,

        collected:
          Math.max(
            0,
            currentCount -
            startCount
          ),

        blocksBroken,

        startCount,

        currentCount
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
      | "RESOURCE_NOT_FOUND"
      | "TARGET_NOT_ACCESSIBLE"
      | "BLOCK_NOT_DIGGABLE"
      | "INVENTORY_FULL"
      | "PATH_NOT_FOUND"
      | "NO_PROGRESS"
      | "UNKNOWN",

    params: CollectBlockParams,

    startCount: number,

    blocksBroken: number,

    expectedItem?: string,

    bot?: SkillContext["bot"]

  ): SkillResult {

    const currentCount =
      bot &&
      expectedItem

        ? this.countItem(
            bot,
            expectedItem
          )

        : startCount;


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

        block:
          params.block,

        expectedItem:
          expectedItem ?? "",

        requested:
          params.amount,

        collected:
          Math.max(
            0,
            currentCount -
            startCount
          ),

        blocksBroken,

        startCount,

        currentCount
      }
    };
  }
}