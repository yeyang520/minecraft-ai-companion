// =====================================================
// Resource Groups
//
// 这里描述的是：
//
// “这些不同 Minecraft Item
//  在某种任务语义上可以互相替代。”
//
// 例如：
//
// wooden_pickaxe 并不关心你用的是
// oak_planks 还是 birch_planks。
//
// 它只关心：
// ANY_PLANK ×3
// =====================================================


// =====================================================
// Log -> Plank
//
// 保持材质对应关系：
//
// birch_log
// -> birch_planks
//
// spruce_log
// -> spruce_planks
//
// 而不是统一变成 oak_planks。
// =====================================================

export const LOG_TO_PLANK:
  Record<string, string> = {

  oak_log:
    "oak_planks",

  birch_log:
    "birch_planks",

  spruce_log:
    "spruce_planks",

  jungle_log:
    "jungle_planks",

  acacia_log:
    "acacia_planks",

  dark_oak_log:
    "dark_oak_planks",

  mangrove_log:
    "mangrove_planks",

  cherry_log:
    "cherry_planks",

  pale_oak_log:
    "pale_oak_planks",

  crimson_stem:
    "crimson_planks",

  warped_stem:
    "warped_planks"
};


// =====================================================
// Resource Groups
// =====================================================

export const RESOURCE_GROUPS = {

  ANY_LOG:
    Object.keys(
      LOG_TO_PLANK
    ),

  ANY_PLANK:
    Object.values(
      LOG_TO_PLANK
    )

} as const;


export type ResourceGroupName =
  keyof typeof RESOURCE_GROUPS;


// =====================================================
// Get Members
// =====================================================

export function getResourceGroupMembers(
  group: ResourceGroupName
): readonly string[] {

  return RESOURCE_GROUPS[
    group
  ];
}


// =====================================================
// Is Group
// =====================================================

export function isResourceGroupName(
  value: string
): value is ResourceGroupName {

  return (
    value in
    RESOURCE_GROUPS
  );
}


// =====================================================
// Is Member
// =====================================================

export function isResourceGroupMember(
  group: ResourceGroupName,
  item: string
): boolean {

  return getResourceGroupMembers(
    group
  ).includes(
    item as never
  );
}


// =====================================================
// Log -> Plank
// =====================================================

export function getPlankForLog(
  log: string
): string | null {

  return (
    LOG_TO_PLANK[
      log
    ] ??
    null
  );
}