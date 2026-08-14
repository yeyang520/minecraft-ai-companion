import { goals } from "mineflayer-pathfinder";

import type {
  Skill,
  SkillContext,
  SkillResult
} from "../Skill";


const {
  GoalNear,
  GoalLookAtBlock
} = goals;


// =====================================================
// Params
// =====================================================

export interface CollectBlockParams {

  // 世界中真正需要破坏的方块
  //
  // stone
  // iron_ore
  // oak_log
  block: string;


  // 增量采集数量
  amount?: number;


  // 最终应该进入背包的 item
  //
  // stone -> cobblestone
  // iron_ore -> raw_iron
  expectedItem?: string;


  radius?: number;

  maxCandidates?: number;

  pickupWaitTicks?: number;
}


// =====================================================
// Candidate
// =====================================================

interface Candidate {

  position: any;

  priority: number;

  distance: number;

  exposed: boolean;

  visible: boolean;

  diggable: boolean;

  isTree: boolean;
}


// =====================================================
// Access node
// =====================================================

interface AccessNode {

  position: any;

  parentKey: string | null;

  depth: number;
}


// =====================================================
// CollectBlockSkill
// =====================================================

export class CollectBlockSkill
  implements Skill<CollectBlockParams> {

  readonly name =
    "collect_block";


  readonly category =
    "ACTION" as const;


  // ===================================================
  // execute
  // ===================================================

  async execute(
    ctx: SkillContext,
    params: CollectBlockParams,
    signal: AbortSignal
  ): Promise<SkillResult> {

    const startedAt =
      Date.now();


    const { bot } =
      ctx;


    // =================================================
    // Params
    // =================================================

    const amount =
      params.amount ??
      1;


    const expectedItem =
      params.expectedItem ??
      params.block;


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
        8,
        Math.min(
          params.maxCandidates ??
          32,
          128
        )
      );


    const pickupWaitTicks =
      Math.max(
        4,
        Math.min(
          params.pickupWaitTicks ??
          20,
          60
        )
      );


    // stone 特别多。
    //
    // 搜索池必须大，
    // 否则脚下石层会占满结果。
    const searchCount =
      Math.min(
        Math.max(
          maxCandidates * 16,
          512
        ),
        2048
      );


    // =================================================
    // Validate
    // =================================================

    if (
      !params.block ||
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


    const blockInfo =
      bot.registry.blocksByName[
        params.block
      ];


    if (!blockInfo) {

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

          block:
            params.block
        }
      };
    }


    if (
      !bot.registry.itemsByName[
        expectedItem
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

          expectedItem
        }
      };
    }


    // =================================================
    // Inventory target
    // =================================================

    const startCount =
      this.countItem(
        ctx,
        expectedItem
      );


    const targetCount =
      startCount +
      amount;


    let targetBlocksBroken =
      0;


    let accessBlocksBroken =
      0;


    let leavesBroken =
      0;


    let noInventoryProgressStreak =
      0;


    let attempts =
      0;


    let lastFailure:
      any =
      null;


    // =================================================
    // Cancel
    // =================================================

    const onAbort =
      () => {

        this.stopBody(
          ctx
        );
      };


    signal.addEventListener(
      "abort",
      onAbort,
      {
        once:
          true
      }
    );


    try {

      const maxAttempts =
        Math.max(
          64,
          amount * 24,
          maxCandidates * 8
        );


      // =================================================
      // Main loop
      // =================================================

      while (
        attempts <
        maxAttempts
      ) {

        if (
          signal.aborted
        ) {

          return this.cancelledResult(
            ctx,
            params,
            expectedItem,
            amount,
            startCount,
            targetBlocksBroken,
            accessBlocksBroken,
            leavesBroken,
            startedAt
          );
        }


        // ===============================================
        // Inventory is final truth
        // ===============================================

        const currentCount =
          this.countItem(
            ctx,
            expectedItem
          );


        if (
          currentCount >=
          targetCount
        ) {

          return this.successResult(
            ctx,
            params,
            expectedItem,
            amount,
            startCount,
            targetBlocksBroken,
            accessBlocksBroken,
            leavesBroken,
            startedAt
          );
        }


        if (
          !this.hasRoomForItem(
            ctx,
            expectedItem
          )
        ) {

          return {

            skill:
              this.name,

            status:
              "FAILED",

            reason:
              "INVENTORY_FULL",

            startedAt,

            finishedAt:
              Date.now(),

            progress:
              this.buildProgress(
                ctx,
                params,
                expectedItem,
                amount,
                startCount,
                targetBlocksBroken,
                accessBlocksBroken,
                leavesBroken,
                noInventoryProgressStreak
              )
          };
        }


        // =================================================
        // Search
        // =================================================

        let positions:
          any[];


        try {

          positions =
            bot.findBlocks({

              matching:
                blockInfo.id,

              maxDistance:
                radius,

              count:
                searchCount
            });


        } catch (error) {

          console.error(
            "[CollectBlock][FindBlocksError]",
            error
          );


          return {

            skill:
              this.name,

            status:
              "FAILED",

            reason:
              "UNKNOWN",

            startedAt,

            finishedAt:
              Date.now(),

            data: {

              stage:
                "FIND_BLOCKS",

              error:
                String(error)
            }
          };
        }


        if (
          positions.length ===
          0
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
                expectedItem,
                amount,
                startCount,
                targetBlocksBroken,
                accessBlocksBroken,
                leavesBroken,
                noInventoryProgressStreak
              )
          };
        }


        // =================================================
        // Build candidates
        //
        // 0   = 当前直接能挖
        // 10  = 表面并可见
        // 20  = 表面但当前位置不可见
        // 100 = 地下/内部
        //
        // 地面石墙永远在地下资源之前。
        // =================================================

        const candidates:
          Candidate[] = [];


        for (
          const position
          of positions
        ) {

          const block =
            this.safeBlockAt(
              ctx,
              position
            );


          if (
            !block ||
            block.name !==
              params.block
          ) {

            continue;
          }


          const exposed =
            this.isExposedSafe(
              ctx,
              block
            );


          const visible =
            this.canSeeSafe(
              ctx,
              block
            );


          const diggable =
            this.canDigSafe(
              ctx,
              block
            );


          const isTree =
            this.isTreeBlock(
              block.name
            );


          const distance =
            bot.entity.position
              .distanceTo(
                block.position
              );


          let priority:
            number;


          if (
            visible &&
            diggable
          ) {

            priority =
              0;
          }


          else if (
            exposed &&
            visible
          ) {

            priority =
              10;
          }


          else if (
            exposed
          ) {

            priority =
              20;
          }


          else {

            priority =
              100;
          }


          candidates.push({

            position,

            priority,

            distance,

            exposed,

            visible,

            diggable,

            isTree
          });
        }


        candidates.sort(
          (
            a,
            b
          ) => {

            if (
              a.priority !==
              b.priority
            ) {

              return (
                a.priority -
                b.priority
              );
            }


            return (
              a.distance -
              b.distance
            );
          }
        );


        // =================================================
        // 第一批：
        // 所有表面候选
        //
        // 第二批：
        // 最多4个地下候选
        // =================================================

        const surfaceCandidates =
          candidates
            .filter(
              candidate =>
                candidate.priority <
                100
            )
            .slice(
              0,
              maxCandidates
            );


        const undergroundCandidates =
          candidates
            .filter(
              candidate =>
                candidate.priority >=
                100
            )
            .slice(
              0,
              4
            );


        const candidatesToTry = [

          ...surfaceCandidates,

          ...undergroundCandidates
        ];


        console.log(
          "[CollectBlock][Candidates]",
          candidatesToTry
            .slice(
              0,
              12
            )
            .map(
              candidate => ({

                target:
                  this.positionData(
                    candidate.position
                  ),

                priority:
                  candidate.priority,

                distance:
                  Number(
                    candidate.distance
                      .toFixed(
                        2
                      )
                  ),

                exposed:
                  candidate.exposed,

                canSeeNow:
                  candidate.visible,

                canDigNow:
                  candidate.diggable,

                underground:
                  candidate.priority >=
                  100
              })
            )
        );


        if (
          candidatesToTry.length ===
          0
        ) {

          return {

            skill:
              this.name,

            status:
              "FAILED",

            reason:
              "TARGET_NOT_ACCESSIBLE",

            startedAt,

            finishedAt:
              Date.now()
          };
        }


        let worldChanged =
          false;


        let targetBroken =
          false;


        // =================================================
        // Try candidate
        // =================================================

        for (
          const candidate
          of candidatesToTry
        ) {

          attempts++;


          if (
            signal.aborted
          ) {

            return this.cancelledResult(
              ctx,
              params,
              expectedItem,
              amount,
              startCount,
              targetBlocksBroken,
              accessBlocksBroken,
              leavesBroken,
              startedAt
            );
          }


          let block =
            this.safeBlockAt(
              ctx,
              candidate.position
            );


          if (
            !block ||
            block.name !==
              params.block
          ) {

            continue;
          }


          // =================================================
          // Tree
          // =================================================

          if (
            this.isTreeBlock(
              block.name
            ) &&
            !this.isExposedSafe(
              ctx,
              block
            )
          ) {

            const cleared =
              await this.clearTreeLeaves(
                ctx,
                block,
                signal
              );


            if (
              cleared >
              0
            ) {

              leavesBroken +=
                cleared;


              worldChanged =
                true;
            }


            block =
              this.safeBlockAt(
                ctx,
                candidate.position
              );


            if (
              !block ||
              block.name !==
                params.block
            ) {

              continue;
            }
          }


          // =================================================
          // Underground target
          //
          // 没暴露：
          // 主动开路。
          // =================================================

          if (
            !this.isExposedSafe(
              ctx,
              block
            )
          ) {

            const beforeAccessCount =
              this.countItem(
                ctx,
                expectedItem
              );


            const access =
              await this.openAccessToTarget(
                ctx,
                candidate.position,
                params.block,
                signal
              );


            if (
              access >
              0
            ) {

              accessBlocksBroken +=
                access;


              worldChanged =
                true;
            }


            // =============================================
            // 非常重要：
            //
            // 开路可能本身挖的是 stone。
            //
            // 如果我们目标是 cobblestone，
            // 这些圆石就是合法进度。
            // =============================================

            await this.waitForInventoryChange(
              ctx,
              expectedItem,
              beforeAccessCount,
              pickupWaitTicks,
              signal
            );


            const countAfterAccess =
              this.countItem(
                ctx,
                expectedItem
              );


            if (
              countAfterAccess >=
              targetCount
            ) {

              return this.successResult(
                ctx,
                params,
                expectedItem,
                amount,
                startCount,
                targetBlocksBroken,
                accessBlocksBroken,
                leavesBroken,
                startedAt
              );
            }


            // 环境变过了。
            //
            // 不在旧世界状态下继续硬执行。
            if (
              access >
              0
            ) {

              break;
            }


            continue;
          }


          // =================================================
          // Target exposed
          // =================================================

          block =
            this.safeBlockAt(
              ctx,
              candidate.position
            );


          if (
            !block ||
            block.name !==
              params.block
          ) {

            continue;
          }


          // =================================================
          // 当前不能直接挖：
          //
          // 让 Pathfinder 只负责移动。
          //
          // BotManager 已经禁止：
          // - 挖方块
          // - 放脚手架
          // =================================================

          if (
            !(
              this.canSeeSafe(
                ctx,
                block
              ) &&
              this.canDigSafe(
                ctx,
                block
              )
            )
          ) {

            try {

              await bot.pathfinder.goto(
                new GoalLookAtBlock(
                  block.position,
                  bot.world,
                  {
                    reach:
                      4.5
                  }
                )
              );


            } catch (error) {

              lastFailure = {

                stage:
                  "APPROACH",

                target:
                  this.positionData(
                    block.position
                  ),

                error:
                  String(error)
              };


              console.log(
                "[CollectBlock][ApproachFailed]",
                lastFailure
              );


              // 这一块走不到，
              // 换下一块。
              continue;
            }
          }


          // =================================================
          // Re-read
          // =================================================

          block =
            this.safeBlockAt(
              ctx,
              candidate.position
            );


          if (
            !block ||
            block.name !==
              params.block
          ) {

            continue;
          }


          try {

            await bot.lookAt(
              block.position.offset(
                0.5,
                0.5,
                0.5
              ),
              true
            );


          } catch {

            continue;
          }


          if (
            !this.canSeeSafe(
              ctx,
              block
            ) ||
            !this.canDigSafe(
              ctx,
              block
            )
          ) {

            lastFailure = {

              stage:
                "FINAL_CHECK",

              target:
                this.positionData(
                  block.position
                ),

              exposed:
                this.isExposedSafe(
                  ctx,
                  block
                ),

              canSee:
                this.canSeeSafe(
                  ctx,
                  block
                ),

              canDig:
                this.canDigSafe(
                  ctx,
                  block
                )
            };


            console.log(
              "[CollectBlock][FinalCheckFailed]",
              lastFailure
            );


            continue;
          }


          // =================================================
          // Equip
          // =================================================

          await this.equipBestTool(
            ctx,
            block
          );


          try {

            await bot.lookAt(
              block.position.offset(
                0.5,
                0.5,
                0.5
              ),
              true
            );


          } catch {
            // ignore
          }


          if (
            !this.canSeeSafe(
              ctx,
              block
            ) ||
            !this.canDigSafe(
              ctx,
              block
            )
          ) {

            continue;
          }


          const beforeDigCount =
            this.countItem(
              ctx,
              expectedItem
            );


          const targetPosition =
            block.position.clone();


          console.log(
            "[CollectBlock][BeforeDig]",
            {

              block:
                block.name,

              expectedItem,

              heldItem:
                bot.heldItem?.name ??
                null,

              target:
                this.positionData(
                  targetPosition
                ),

              botPosition:
                this.positionData(
                  bot.entity.position
                ),

              canSeeBlock:
                this.canSeeSafe(
                  ctx,
                  block
                ),

              canDigBlock:
                this.canDigSafe(
                  ctx,
                  block
                )
            }
          );


          // =================================================
          // Dig target
          // =================================================

          const broken =
            await this.breakBlock(
              ctx,
              block,
              signal
            );


          if (
            !broken
          ) {

            lastFailure = {

              stage:
                "DIG_FAILED",

              target:
                this.positionData(
                  targetPosition
                )
            };


            continue;
          }


          targetBlocksBroken++;


          targetBroken =
            true;


          worldChanged =
            true;


          console.log(
            "[CollectBlock][BlockBroken]",
            {

              block:
                params.block,

              expectedItem,

              target:
                this.positionData(
                  targetPosition
                )
            }
          );


          // =================================================
          // Pick up
          //
          // Pathfinder 已禁止放方块，
          // 所以这里不会拿 cobblestone 去垫。
          // =================================================

          await this.moveNearForPickup(
            ctx,
            targetPosition
          );


          await this.waitForInventoryChange(
            ctx,
            expectedItem,
            beforeDigCount,
            pickupWaitTicks,
            signal
          );


          const afterDigCount =
            this.countItem(
              ctx,
              expectedItem
            );


          // =================================================
          // Inventory progress
          // =================================================

          if (
            afterDigCount >
            beforeDigCount
          ) {

            noInventoryProgressStreak =
              0;
          }


          else {

            noInventoryProgressStreak++;


            console.log(
              "[CollectBlock][NoInventoryIncrease]",
              {

                block:
                  params.block,

                expectedItem,

                before:
                  beforeDigCount,

                after:
                  afterDigCount,

                streak:
                  noInventoryProgressStreak
              }
            );
          }


          if (
            afterDigCount >=
            targetCount
          ) {

            return this.successResult(
              ctx,
              params,
              expectedItem,
              amount,
              startCount,
              targetBlocksBroken,
              accessBlocksBroken,
              leavesBroken,
              startedAt
            );
          }


          // =============================================
          // 不再一两次就 NO_PROGRESS。
          //
          // 连续6次真的破坏目标，
          // 背包却一次都不涨，
          // 才认为存在真正异常。
          // =============================================

          if (
            noInventoryProgressStreak >=
            6
          ) {

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
                  expectedItem,
                  amount,
                  startCount,
                  targetBlocksBroken,
                  accessBlocksBroken,
                  leavesBroken,
                  noInventoryProgressStreak
                ),

              data: {

                message:
                  "Target blocks were broken repeatedly, but expected inventory did not increase.",

                lastFailure
              }
            };
          }


          // 每挖一个重新观察。
          break;
        }


        // =================================================
        // World changed
        //
        // 重新搜索，不继续用旧 Candidate。
        // =================================================

        if (
          worldChanged
        ) {

          await bot.waitForTicks(
            1
          );


          continue;
        }


        if (
          !targetBroken
        ) {

          return {

            skill:
              this.name,

            status:
              "FAILED",

            reason:
              lastFailure?.stage ===
                "APPROACH"
                ? "PATH_NOT_FOUND"
                : "TARGET_NOT_ACCESSIBLE",

            startedAt,

            finishedAt:
              Date.now(),

            progress:
              this.buildProgress(
                ctx,
                params,
                expectedItem,
                amount,
                startCount,
                targetBlocksBroken,
                accessBlocksBroken,
                leavesBroken,
                noInventoryProgressStreak
              ),

            data: {

              lastFailure
            }
          };
        }
      }


      // =================================================
      // Final verifier
      // =================================================

      if (
        this.countItem(
          ctx,
          expectedItem
        ) >=
        targetCount
      ) {

        return this.successResult(
          ctx,
          params,
          expectedItem,
          amount,
          startCount,
          targetBlocksBroken,
          accessBlocksBroken,
          leavesBroken,
          startedAt
        );
      }


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
            expectedItem,
            amount,
            startCount,
            targetBlocksBroken,
            accessBlocksBroken,
            leavesBroken,
            noInventoryProgressStreak
          )
      };


    } catch (error) {

      console.error(
        "[CollectBlock][UnhandledError]",
        error
      );


      return {

        skill:
          this.name,

        status:
          "FAILED",

        reason:
          "UNKNOWN",

        startedAt,

        finishedAt:
          Date.now(),

        data: {

          stage:
            "UNHANDLED",

          error:
            String(error)
        }
      };


    } finally {

      signal.removeEventListener(
        "abort",
        onAbort
      );
    }
  }


  // ===================================================
  // Open access
  //
  // 只在没有表面资源可用时才会轮到地下候选。
  //
  // 从目标向外 BFS，
  // 找到一条由安全自然方块组成的链。
  // ===================================================

  private async openAccessToTarget(
    ctx: SkillContext,
    targetPosition: any,
    targetBlockName: string,
    signal: AbortSignal
  ): Promise<number> {

    const { bot } =
      ctx;


    let totalCleared =
      0;


    const maxClear =
      8;


    for (
      let round = 0;
      round < 4;
      round++
    ) {

      if (
        signal.aborted ||
        totalCleared >=
          maxClear
      ) {

        break;
      }


      const target =
        this.safeBlockAt(
          ctx,
          targetPosition
        );


      if (
        !target ||
        target.name !==
          targetBlockName
      ) {

        break;
      }


      // 已经暴露。
      if (
        this.isExposedSafe(
          ctx,
          target
        )
      ) {

        break;
      }


      const path =
        this.findAccessPath(
          ctx,
          targetPosition,
          8
        );


      if (
        !path ||
        path.length <=
        1
      ) {

        break;
      }


      console.log(
        "[CollectBlock][AccessPath]",
        path.map(
          p =>
            this.positionData(
              p
            )
        )
      );


      // path:
      //
      // surface -> ... -> target
      //
      // 最后 target 不在这里破坏。
      for (
        let i = 0;
        i <
        path.length - 1;
        i++
      ) {

        if (
          signal.aborted ||
          totalCleared >=
            maxClear
        ) {

          break;
        }


        const position =
          path[i];


        let block =
          this.safeBlockAt(
            ctx,
            position
          );


        if (
          !block ||
          block.boundingBox ===
            "empty"
        ) {

          continue;
        }


        if (
          !this.isSafeAccessBlock(
            block.name
          )
        ) {

          break;
        }


        // 不把自己脚下支撑块直接挖掉。
        if (
          this.isSupportBlock(
            ctx,
            block.position
          )
        ) {

          break;
        }


        if (
          this.hasLavaNeighbor(
            ctx,
            block
          )
        ) {

          break;
        }


        // 必须先暴露。
        if (
          !this.isExposedSafe(
            ctx,
            block
          )
        ) {

          break;
        }


        // 当前不能直接挖，
        // 就移动过去。
        if (
          !(
            this.canSeeSafe(
              ctx,
              block
            ) &&
            this.canDigSafe(
              ctx,
              block
            )
          )
        ) {

          try {

            await bot.pathfinder.goto(
              new GoalLookAtBlock(
                block.position,
                bot.world,
                {
                  reach:
                    4.5
                }
              )
            );


          } catch {

            break;
          }
        }


        block =
          this.safeBlockAt(
            ctx,
            position
          );


        if (!block) {

          continue;
        }


        if (
          !this.canSeeSafe(
            ctx,
            block
          ) ||
          !this.canDigSafe(
            ctx,
            block
          )
        ) {

          break;
        }


        await this.equipBestTool(
          ctx,
          block
        );


        console.log(
          "[CollectBlock][ClearAccess]",
          {

            block:
              block.name,

            position:
              this.positionData(
                block.position
              )
          }
        );


        const broken =
          await this.breakBlock(
            ctx,
            block,
            signal
          );


        if (!broken) {

          break;
        }


        totalCleared++;


        // 靠近掉落位置。
        await this.moveNearForPickup(
          ctx,
          position
        );


        await bot.waitForTicks(
          2
        );


        const latestTarget =
          this.safeBlockAt(
            ctx,
            targetPosition
          );


        if (
          latestTarget &&
          latestTarget.name ===
            targetBlockName &&
          this.isExposedSafe(
            ctx,
            latestTarget
          )
        ) {

          return totalCleared;
        }
      }


      await bot.waitForTicks(
        1
      );
    }


    return totalCleared;
  }


  // ===================================================
  // BFS Access Path
  // ===================================================

  private findAccessPath(
    ctx: SkillContext,
    targetPosition: any,
    maxDepth: number
  ): any[] | null {

    const queue:
      AccessNode[] = [];


    const nodes =
      new Map<
        string,
        AccessNode
      >();


    const start:
      AccessNode = {

      position:
        targetPosition.clone(),

      parentKey:
        null,

      depth:
        0
    };


    const startKey =
      this.positionKey(
        start.position
      );


    queue.push(
      start
    );


    nodes.set(
      startKey,
      start
    );


    const frontier:
      AccessNode[] = [];


    const dirs = [

      [1, 0, 0],
      [-1, 0, 0],

      [0, 1, 0],
      [0, -1, 0],

      [0, 0, 1],
      [0, 0, -1]

    ];


    let cursor =
      0;


    while (
      cursor <
        queue.length &&
      nodes.size <
        1200
    ) {

      const node =
        queue[cursor++];


      const block =
        this.safeBlockAt(
          ctx,
          node.position
        );


      if (!block) {

        continue;
      }


      if (
        node.depth >
          0 &&
        !this.isSafeAccessBlock(
          block.name
        )
      ) {

        continue;
      }


      if (
        node.depth >
          0 &&
        this.isExposedSafe(
          ctx,
          block
        ) &&
        !this.isSupportBlock(
          ctx,
          block.position
        ) &&
        !this.hasLavaNeighbor(
          ctx,
          block
        )
      ) {

        frontier.push(
          node
        );


        if (
          frontier.length >=
          32
        ) {

          break;
        }
      }


      if (
        node.depth >=
        maxDepth
      ) {

        continue;
      }


      for (
        const [
          dx,
          dy,
          dz
        ]
        of dirs
      ) {

        const nextPosition =
          node.position.offset(
            dx,
            dy,
            dz
          );


        const key =
          this.positionKey(
            nextPosition
          );


        if (
          nodes.has(
            key
          )
        ) {

          continue;
        }


        const nextBlock =
          this.safeBlockAt(
            ctx,
            nextPosition
          );


        if (!nextBlock) {

          continue;
        }


        if (
          !this.isSafeAccessBlock(
            nextBlock.name
          )
        ) {

          continue;
        }


        const next:
          AccessNode = {

          position:
            nextPosition,

          parentKey:
            this.positionKey(
              node.position
            ),

          depth:
            node.depth +
            1
        };


        nodes.set(
          key,
          next
        );


        queue.push(
          next
        );
      }
    }


    if (
      frontier.length ===
      0
    ) {

      return null;
    }


    // =================================================
    // 优先机器人附近的表面入口
    // =================================================

    frontier.sort(
      (
        a,
        b
      ) => {

        const blockA =
          this.safeBlockAt(
            ctx,
            a.position
          );


        const blockB =
          this.safeBlockAt(
            ctx,
            b.position
          );


        if (
          !blockA &&
          !blockB
        ) {

          return 0;
        }


        if (!blockA) {

          return 1;
        }


        if (!blockB) {

          return -1;
        }


        const directA =
          this.canSeeSafe(
            ctx,
            blockA
          ) &&
          this.canDigSafe(
            ctx,
            blockA
          );


        const directB =
          this.canSeeSafe(
            ctx,
            blockB
          ) &&
          this.canDigSafe(
            ctx,
            blockB
          );


        if (
          directA !==
          directB
        ) {

          return directA
            ? -1
            : 1;
        }


        const da =
          ctx.bot.entity.position
            .distanceTo(
              blockA.position
            );


        const db =
          ctx.bot.entity.position
            .distanceTo(
              blockB.position
            );


        return (
          da +
          a.depth * 0.5
        ) -
        (
          db +
          b.depth * 0.5
        );
      }
    );


    // =================================================
    // Reconstruct:
    //
    // surface -> ... -> target
    // =================================================

    const result:
      any[] = [];


    let key:
      string | null =
      this.positionKey(
        frontier[0]
          .position
      );


    while (key) {

      const node =
        nodes.get(
          key
        );


      if (!node) {

        break;
      }


      result.push(
        node.position.clone()
      );


      key =
        node.parentKey;
    }


    return result;
  }


  // ===================================================
  // Break one block
  // ===================================================

  private async breakBlock(
    ctx: SkillContext,
    block: any,
    signal: AbortSignal
  ): Promise<boolean> {

    const { bot } =
      ctx;


    if (
      signal.aborted
    ) {

      return false;
    }


    const position =
      block.position.clone();


    const name =
      block.name;


    if (
      !this.canSeeSafe(
        ctx,
        block
      ) ||
      !this.canDigSafe(
        ctx,
        block
      )
    ) {

      return false;
    }


    try {

      await bot.lookAt(
        block.position.offset(
          0.5,
          0.5,
          0.5
        ),
        true
      );


      await bot.dig(
        block,
        true
      );


    } catch (error) {

      console.log(
        "[CollectBlock][DigFailed]",
        {

          block:
            name,

          target:
            this.positionData(
              position
            ),

          error:
            String(error)
        }
      );


      return false;
    }


    // =================================================
    // 世界状态验证
    // =================================================

    for (
      let i = 0;
      i < 12;
      i++
    ) {

      if (
        signal.aborted
      ) {

        return false;
      }


      const current =
        this.safeBlockAt(
          ctx,
          position
        );


      if (
        !current ||
        current.name !==
          name
      ) {

        return true;
      }


      await bot.waitForTicks(
        1
      );
    }


    return false;
  }


  // ===================================================
  // Move near dropped item position
  //
  // 注意：
  // Pathfinder 已通过 BotManager 禁止放方块。
  // ===================================================

  private async moveNearForPickup(
    ctx: SkillContext,
    position: any
  ): Promise<void> {

    const { bot } =
      ctx;


    const distance =
      bot.entity.position
        .distanceTo(
          position
        );


    if (
      distance <=
      1.35
    ) {

      return;
    }


    try {

      await bot.pathfinder.goto(
        new GoalNear(
          Math.floor(
            position.x
          ),

          Math.floor(
            position.y
          ),

          Math.floor(
            position.z
          ),

          1
        )
      );


    } catch {

      // 拾取路径失败不代表目标没挖掉。
    }
  }


  // ===================================================
  // Wait inventory
  // ===================================================

  private async waitForInventoryChange(
    ctx: SkillContext,
    itemName: string,
    beforeCount: number,
    maxTicks: number,
    signal: AbortSignal
  ): Promise<boolean> {

    const { bot } =
      ctx;


    let waited =
      0;


    while (
      waited <
      maxTicks
    ) {

      if (
        signal.aborted
      ) {

        return false;
      }


      const current =
        this.countItem(
          ctx,
          itemName
        );


      if (
        current >
        beforeCount
      ) {

        return true;
      }


      await bot.waitForTicks(
        2
      );


      waited +=
        2;
    }


    return false;
  }


  // ===================================================
  // Tree leaves
  // ===================================================

  private async clearTreeLeaves(
    ctx: SkillContext,
    target: any,
    signal: AbortSignal
  ): Promise<number> {

    const { bot } =
      ctx;


    let cleared =
      0;


    const leaves:
      any[] = [];


    for (
      let dx = -3;
      dx <= 3;
      dx++
    ) {

      for (
        let dy = -2;
        dy <= 3;
        dy++
      ) {

        for (
          let dz = -3;
          dz <= 3;
          dz++
        ) {

          const block =
            this.safeBlockAt(
              ctx,
              target.position.offset(
                dx,
                dy,
                dz
              )
            );


          if (
            !block ||
            !block.name.endsWith(
              "_leaves"
            )
          ) {

            continue;
          }


          if (
            !this.isExposedSafe(
              ctx,
              block
            )
          ) {

            continue;
          }


          leaves.push(
            block
          );
        }
      }
    }


    leaves.sort(
      (
        a,
        b
      ) =>
        bot.entity.position
          .distanceTo(
            a.position
          ) -
        bot.entity.position
          .distanceTo(
            b.position
          )
    );


    for (
      const leaf
      of leaves.slice(
        0,
        12
      )
    ) {

      if (
        signal.aborted
      ) {

        break;
      }


      let block =
        this.safeBlockAt(
          ctx,
          leaf.position
        );


      if (
        !block ||
        !block.name.endsWith(
          "_leaves"
        )
      ) {

        continue;
      }


      if (
        !(
          this.canSeeSafe(
            ctx,
            block
          ) &&
          this.canDigSafe(
            ctx,
            block
          )
        )
      ) {

        try {

          await bot.pathfinder.goto(
            new GoalLookAtBlock(
              block.position,
              bot.world,
              {
                reach:
                  4.5
              }
            )
          );


        } catch {

          continue;
        }


        block =
          this.safeBlockAt(
            ctx,
            leaf.position
          );
      }


      if (!block) {

        continue;
      }


      if (
        await this.breakBlock(
          ctx,
          block,
          signal
        )
      ) {

        cleared++;


        const latestTarget =
          this.safeBlockAt(
            ctx,
            target.position
          );


        if (
          latestTarget &&
          this.isExposedSafe(
            ctx,
            latestTarget
          )
        ) {

          break;
        }
      }
    }


    return cleared;
  }


  // ===================================================
  // Safe access blocks
  // ===================================================

  private isSafeAccessBlock(
    name: string
  ): boolean {

    return [

      "grass_block",

      "dirt",

      "coarse_dirt",

      "rooted_dirt",

      "podzol",

      "mycelium",

      "stone",

      "cobblestone",

      "deepslate",

      "cobbled_deepslate",

      "granite",

      "diorite",

      "andesite",

      "tuff",

      "calcite",

      "sand",

      "red_sand",

      "sandstone",

      "red_sandstone",

      "gravel",

      "clay",

      "mud",

      "netherrack"

    ].includes(
      name
    );
  }


  // ===================================================
  // Lava safety
  // ===================================================

  private hasLavaNeighbor(
    ctx: SkillContext,
    block: any
  ): boolean {

    const dirs = [

      [1, 0, 0],
      [-1, 0, 0],

      [0, 1, 0],
      [0, -1, 0],

      [0, 0, 1],
      [0, 0, -1]

    ];


    for (
      const [
        dx,
        dy,
        dz
      ]
      of dirs
    ) {

      const neighbor =
        this.safeBlockAt(
          ctx,
          block.position.offset(
            dx,
            dy,
            dz
          )
        );


      if (
        neighbor?.name ===
        "lava"
      ) {

        return true;
      }
    }


    return false;
  }


  // ===================================================
  // Exposed
  // ===================================================

  private isExposedSafe(
    ctx: SkillContext,
    block: any
  ): boolean {

    const dirs = [

      [1, 0, 0],
      [-1, 0, 0],

      [0, 1, 0],
      [0, -1, 0],

      [0, 0, 1],
      [0, 0, -1]

    ];


    try {

      for (
        const [
          dx,
          dy,
          dz
        ]
        of dirs
      ) {

        const neighbor =
          ctx.bot.blockAt(
            block.position.offset(
              dx,
              dy,
              dz
            )
          );


        if (
          neighbor &&
          neighbor.boundingBox ===
            "empty"
        ) {

          return true;
        }
      }


      return false;


    } catch {

      return false;
    }
  }


  // ===================================================
  // Equip
  // ===================================================

  private async equipBestTool(
    ctx: SkillContext,
    block: any
  ): Promise<void> {

    try {

      const tool =
        ctx.bot.pathfinder
          .bestHarvestTool(
            block
          );


      if (tool) {

        await ctx.bot.equip(
          tool,
          "hand"
        );
      }


    } catch (error) {

      console.log(
        "[CollectBlock][EquipWarning]",
        {

          block:
            block.name,

          error:
            String(error)
        }
      );
    }
  }


  // ===================================================
  // Helpers
  // ===================================================

  private safeBlockAt(
    ctx: SkillContext,
    position: any
  ): any | null {

    try {

      return ctx.bot.blockAt(
        position
      );


    } catch {

      return null;
    }
  }


  private canSeeSafe(
    ctx: SkillContext,
    block: any
  ): boolean {

    try {

      return (
        ctx.bot.canSeeBlock(
          block
        ) ===
        true
      );


    } catch {

      return false;
    }
  }


  private canDigSafe(
    ctx: SkillContext,
    block: any
  ): boolean {

    try {

      return (
        ctx.bot.canDigBlock(
          block
        ) ===
        true
      );


    } catch {

      return false;
    }
  }


  private isTreeBlock(
    name: string
  ): boolean {

    return (
      name.endsWith(
        "_log"
      ) ||
      name.endsWith(
        "_stem"
      )
    );
  }


  // 当前脚下支撑块不主动挖。
  private isSupportBlock(
    ctx: SkillContext,
    position: any
  ): boolean {

    const x =
      Math.floor(
        ctx.bot.entity.position.x
      );


    const y =
      Math.floor(
        ctx.bot.entity.position.y
      );


    const z =
      Math.floor(
        ctx.bot.entity.position.z
      );


    return (
      position.x ===
        x &&
      position.z ===
        z &&
      position.y ===
        y - 1
    );
  }


  private positionKey(
    position: any
  ): string {

    return (
      `${position.x},` +
      `${position.y},` +
      `${position.z}`
    );
  }


  private positionData(
    position: any
  ) {

    return {

      x:
        Number(
          position.x
        ),

      y:
        Number(
          position.y
        ),

      z:
        Number(
          position.z
        )
    };
  }


  // ===================================================
  // Inventory
  // ===================================================

  private countItem(
    ctx: SkillContext,
    name: string
  ): number {

    return ctx.bot.inventory
      .items()
      .filter(
        item =>
          item.name ===
          name
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


  private hasRoomForItem(
    ctx: SkillContext,
    name: string
  ): boolean {

    const items =
      ctx.bot.inventory
        .items();


    const info =
      ctx.bot.registry
        .itemsByName[
          name
        ];


    const stackSize =
      info?.stackSize ??
      64;


    for (
      const item
      of items
    ) {

      if (
        item.name ===
          name &&
        item.count <
          stackSize
      ) {

        return true;
      }
    }


    return (
      items.length <
      36
    );
  }


  // ===================================================
  // Progress
  // ===================================================

  private buildProgress(
    ctx: SkillContext,
    params: CollectBlockParams,
    expectedItem: string,
    amount: number,
    startCount: number,
    targetBlocksBroken: number,
    accessBlocksBroken: number,
    leavesBroken: number,
    noInventoryProgressStreak: number
  ) {

    const currentCount =
      this.countItem(
        ctx,
        expectedItem
      );


    return {

      block:
        params.block,

      expectedItem,

      requested:
        amount,

      collected:
        Math.max(
          0,
          currentCount -
          startCount
        ),

      targetBlocksBroken,

      accessBlocksBroken,

      leavesBroken,

      noInventoryProgressStreak,

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
  // Stop
  // ===================================================

  private stopBody(
    ctx: SkillContext
  ): void {

    try {

      ctx.bot.pathfinder
        .setGoal(
          null
        );

    } catch {
      // ignore
    }


    try {

      ctx.bot.clearControlStates();

    } catch {
      // ignore
    }


    try {

      ctx.bot.stopDigging();

    } catch {
      // ignore
    }
  }


  // ===================================================
  // SUCCESS
  // ===================================================

  private successResult(
    ctx: SkillContext,
    params: CollectBlockParams,
    expectedItem: string,
    amount: number,
    startCount: number,
    targetBlocksBroken: number,
    accessBlocksBroken: number,
    leavesBroken: number,
    startedAt: number
  ): SkillResult {

    const currentCount =
      this.countItem(
        ctx,
        expectedItem
      );


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
          amount,

        collected:
          Math.max(
            0,
            currentCount -
            startCount
        ),

        targetBlocksBroken,

        accessBlocksBroken,

        leavesBroken,

        startCount,

        currentCount,

        targetCount:
          startCount +
          amount
      }
    };
  }


  // ===================================================
  // CANCEL
  // ===================================================

  private cancelledResult(
    ctx: SkillContext,
    params: CollectBlockParams,
    expectedItem: string,
    amount: number,
    startCount: number,
    targetBlocksBroken: number,
    accessBlocksBroken: number,
    leavesBroken: number,
    startedAt: number
  ): SkillResult {

    this.stopBody(
      ctx
    );


    const currentCount =
      this.countItem(
        ctx,
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
          amount,

        collected:
          Math.max(
            0,
            currentCount -
            startCount
        ),

        targetBlocksBroken,

        accessBlocksBroken,

        leavesBroken,

        startCount,

        currentCount,

        targetCount:
          startCount +
          amount
      }
    };
  }
}