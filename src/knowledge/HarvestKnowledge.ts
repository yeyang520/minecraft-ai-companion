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
  // Logs
  // ===================================================

  oak_log: [
    {
      block:
        "oak_log",

      expectedItem:
        "oak_log"
    }
  ],


  birch_log: [
    {
      block:
        "birch_log",

      expectedItem:
        "birch_log"
    }
  ],


  spruce_log: [
    {
      block:
        "spruce_log",

      expectedItem:
        "spruce_log"
    }
  ],


  jungle_log: [
    {
      block:
        "jungle_log",

      expectedItem:
        "jungle_log"
    }
  ],


  acacia_log: [
    {
      block:
        "acacia_log",

      expectedItem:
        "acacia_log"
    }
  ],


  dark_oak_log: [
    {
      block:
        "dark_oak_log",

      expectedItem:
        "dark_oak_log"
    }
  ],


  mangrove_log: [
    {
      block:
        "mangrove_log",

      expectedItem:
        "mangrove_log"
    }
  ],


  cherry_log: [
    {
      block:
        "cherry_log",

      expectedItem:
        "cherry_log"
    }
  ],


  // 如果你的 MC 版本支持 Pale Oak，
  // 这一项也可以直接保留。
  pale_oak_log: [
    {
      block:
        "pale_oak_log",

      expectedItem:
        "pale_oak_log"
    }
  ],


  // ===================================================
  // Nether Wood
  //
  // 虽然不是传统 log，
  // 但功能上也是木材资源。
  // ===================================================

  crimson_stem: [
    {
      block:
        "crimson_stem",

      expectedItem:
        "crimson_stem"
    }
  ],


  warped_stem: [
    {
      block:
        "warped_stem",

      expectedItem:
        "warped_stem"
    }
  ],


  // ===================================================
  // Dirt
  //
  // dirt 可以直接来自 dirt，
  // 也可以破坏 grass_block 获得。
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
  // Cobblestone
  //
  // stone + wooden pickaxe
  // → cobblestone
  // ===================================================

  cobblestone: [
    // 已经存在的 cobblestone
    // 直接挖最合理
    {
      block: "cobblestone",

      expectedItem: "cobblestone",

      requiredTool: {
        type: "pickaxe",
        minTier: "wooden"
      }
    },

    // 普通 stone 挖掉后也会得到 cobblestone
    {
      block: "stone",

      expectedItem: "cobblestone",

      requiredTool: {
        type: "pickaxe",
        minTier: "wooden"
      }
    }
  ],


  // ===================================================
  // Raw Iron
  //
  // 至少 Stone Pickaxe
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
// =====================================================

const TOOL_TIER_LEVEL:
  Record<ToolTier, number> = {

  wooden:
    1,

  // 金镐速度快，但挖矿等级仍按低等级处理
  golden:
    1,

  stone:
    2,

  iron:
    3,

  diamond:
    4,

  netherite:
    5
};


// =====================================================
// Get Harvest Sources
// =====================================================

export function getHarvestSources(
  item: string
): HarvestSource[] {

  return (
    HARVEST_KNOWLEDGE[
      item
    ] ?? []
  );
}


// =====================================================
// Has Harvest Knowledge
// =====================================================

export function hasHarvestKnowledge(
  item: string
): boolean {

  return (
    getHarvestSources(
      item
    ).length > 0
  );
}


// =====================================================
// Parse Tool Name
//
// wooden_pickaxe
// stone_pickaxe
// iron_axe
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

  const parsed =
    parseToolName(
      itemName
    );


  if (!parsed) {

    return false;
  }


  // 工具种类必须一致
  if (
    parsed.type !==
    requirement.type
  ) {

    return false;
  }


  return (
    TOOL_TIER_LEVEL[
      parsed.tier
    ] >=
    TOOL_TIER_LEVEL[
      requirement.minTier
    ]
  );
}