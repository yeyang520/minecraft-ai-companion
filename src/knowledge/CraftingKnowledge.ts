export interface CraftIngredient {
  item: string;
  count: number;
}


export interface CraftRecipeKnowledge {
  item: string;

  outputCount: number;

  requiresCraftingTable: boolean;

  ingredients: CraftIngredient[];
}


// =====================================================
// 第一版 Crafting Knowledge
//
// 先只加入我们后面制造石镐真正需要的链。
// 不一次加入整个 Minecraft 配方表。
// =====================================================

const CRAFTING_KNOWLEDGE:
  Record<string, CraftRecipeKnowledge> = {


  // ===================================================
  // Oak Planks
  //
  // 1 oak_log -> 4 oak_planks
  // ===================================================

  oak_planks: {

    item:
      "oak_planks",

    outputCount:
      4,

    requiresCraftingTable:
      false,

    ingredients: [

      {
        item:
          "oak_log",

        count:
          1
      }
    ]
  },


  // ===================================================
  // Stick
  //
  // 2 oak_planks -> 4 stick
  // ===================================================

  stick: {

    item:
      "stick",

    outputCount:
      4,

    requiresCraftingTable:
      false,

    ingredients: [

      {
        item:
          "oak_planks",

        count:
          2
      }
    ]
  },


  // ===================================================
  // Crafting Table
  //
  // 4 oak_planks -> 1 crafting_table
  // ===================================================

  crafting_table: {

    item:
      "crafting_table",

    outputCount:
      1,

    requiresCraftingTable:
      false,

    ingredients: [

      {
        item:
          "oak_planks",

        count:
          4
      }
    ]
  },


  // ===================================================
  // Stone Pickaxe
  //
  // 3 cobblestone + 2 stick
  // ===================================================

  stone_pickaxe: {

    item:
      "stone_pickaxe",

    outputCount:
      1,

    requiresCraftingTable:
      true,

    ingredients: [

      {
        item:
          "cobblestone",

        count:
          3
      },

      {
        item:
          "stick",

        count:
          2
      }
    ]
  }
};


// =====================================================
// Get Recipe
// =====================================================

export function getCraftRecipe(
  item: string
): CraftRecipeKnowledge | null {

  return (
    CRAFTING_KNOWLEDGE[item] ??
    null
  );
}


// =====================================================
// Knowledge Exists
// =====================================================

export function hasCraftingKnowledge(
  item: string
): boolean {

  return (
    CRAFTING_KNOWLEDGE[item] !==
    undefined
  );
}