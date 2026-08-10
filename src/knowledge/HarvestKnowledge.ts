export type ToolType =
  | "pickaxe"
  | "axe"
  | "shovel"
  | "hoe";


export type ToolTier =
  | "wooden"
  | "golden"
  | "stone"
  | "iron"
  | "diamond"
  | "netherite";


export interface HarvestToolRequirement {
  type: ToolType;
  minTier: ToolTier;
}


export interface HarvestSource {
  block: string;
  expectedItem: string;

  requiredTool?: HarvestToolRequirement;
}


// =====================================================
// Harvest Knowledge
// =====================================================

const HARVEST_KNOWLEDGE:
  Record<string, HarvestSource[]> = {


  // ===================================================
  // Oak Log
  // ===================================================

  oak_log: [

    {
      block: "oak_log",

      expectedItem:
        "oak_log"
    }
  ],


  // ===================================================
  // Dirt
  //
  // 普通地表优先 grass_block。
  // ===================================================

  dirt: [

    {
      block:
        "grass_block",

      expectedItem:
        "dirt"
    },

    {
      block:
        "dirt",

      expectedItem:
        "dirt"
    }
  ],


  // ===================================================
  // Raw Iron
  //
  // 第一版明确记录：
  // iron_ore / deepslate_iron_ore
  // 需要 stone pickaxe 或更高。
  // ===================================================

  raw_iron: [

    {
      block:
        "iron_ore",

      expectedItem:
        "raw_iron",

      requiredTool: {
        type:
          "pickaxe",

        minTier:
          "stone"
      }
    },

    {
      block:
        "deepslate_iron_ore",

      expectedItem:
        "raw_iron",

      requiredTool: {
        type:
          "pickaxe",

        minTier:
          "stone"
      }
    }
  ]
};


// =====================================================
// Tool Tier
//
// 注意：golden 工具虽然速度特殊，
// 但不能简单理解成比 stone 更高的采矿等级。
// 所以这里不用数组 index 粗暴比较。
// =====================================================

const TOOL_TIER_LEVEL:
  Record<ToolTier, number> = {

  wooden: 1,

  golden: 1,

  stone: 2,

  iron: 3,

  diamond: 4,

  netherite: 5
};


// =====================================================
// Harvest Sources
// =====================================================

export function getHarvestSources(
  item: string
): HarvestSource[] {

  return (
    HARVEST_KNOWLEDGE[item] ??
    []
  );
}


// =====================================================
// Knowledge Exists
// =====================================================

export function hasHarvestKnowledge(
  item: string
): boolean {

  return (
    HARVEST_KNOWLEDGE[item] !==
    undefined
  );
}


// =====================================================
// Tool Tier Level
// =====================================================

export function getToolTierLevel(
  tier: ToolTier
): number {

  return (
    TOOL_TIER_LEVEL[tier]
  );
}


// =====================================================
// Parse Tool Name
//
// stone_pickaxe
// iron_pickaxe
// diamond_pickaxe
// ...
// =====================================================

export function parseToolName(
  itemName: string
): {
  type: ToolType;
  tier: ToolTier;
} | null {

  const match =
    itemName.match(
      /^(wooden|golden|stone|iron|diamond|netherite)_(pickaxe|axe|shovel|hoe)$/
    );


  if (!match) {
    return null;
  }


  return {

    tier:
      match[1] as ToolTier,

    type:
      match[2] as ToolType
  };
}


// =====================================================
// Tool Meets Requirement
// =====================================================

export function toolMeetsRequirement(
  itemName: string,
  requirement: HarvestToolRequirement
): boolean {

  const tool =
    parseToolName(
      itemName
    );


  if (!tool) {
    return false;
  }


  if (
    tool.type !==
    requirement.type
  ) {
    return false;
  }


  return (
    getToolTierLevel(
      tool.tier
    ) >=
    getToolTierLevel(
      requirement.minTier
    )
  );
}