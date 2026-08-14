import type {
  ResourceGroupName
} from "./ResourceGroups";

import {
  LOG_TO_PLANK
} from "./ResourceGroups";


// =====================================================
// Ingredient
//
// 现在有两种前置条件：
//
// 1. 精确 Item
//
//    cobblestone ×3
//
// 2. Resource Group
//
//    ANY_PLANK ×3
// =====================================================

export type CraftIngredient =

  | {
      kind: "item";

      item: string;

      count: number;
    }

  | {
      kind: "group";

      group: ResourceGroupName;

      count: number;
    };


// =====================================================
// Recipe Knowledge
// =====================================================

export interface CraftRecipeKnowledge {

  item: string;

  outputCount: number;

  requiresCraftingTable: boolean;

  ingredients: CraftIngredient[];
}


// =====================================================
// 自动生成：
//
// oak_log -> oak_planks
// birch_log -> birch_planks
// spruce_log -> spruce_planks
// ...
//
// 这样不用手写十几遍。
// =====================================================

const WOOD_PLANK_RECIPES:
  Record<
    string,
    CraftRecipeKnowledge
  > =
  {};


for (
  const [
    log,
    plank
  ]
  of Object.entries(
    LOG_TO_PLANK
  )
) {

  WOOD_PLANK_RECIPES[
    plank
  ] = {

    item:
      plank,

    outputCount:
      4,

    requiresCraftingTable:
      false,

    ingredients: [

      {
        kind:
          "item",

        item:
          log,

        count:
          1
      }
    ]
  };
}


// =====================================================
// Main Knowledge
// =====================================================

const CRAFTING_KNOWLEDGE:
  Record<
    string,
    CraftRecipeKnowledge
  > = {

  ...WOOD_PLANK_RECIPES,


  // ===================================================
  // Stick
  //
  // 不再要求 oak_planks。
  //
  // 任意木板都可以。
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
        kind:
          "group",

        group:
          "ANY_PLANK",

        count:
          2
      }
    ]
  },


  // ===================================================
  // Crafting Table
  //
  // 任意木板。
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
        kind:
          "group",

        group:
          "ANY_PLANK",

        count:
          4
      }
    ]
  },


  // ===================================================
  // Wooden Pickaxe
  //
  // 任意木板 + stick
  // ===================================================

  wooden_pickaxe: {

    item:
      "wooden_pickaxe",

    outputCount:
      1,

    requiresCraftingTable:
      true,

    ingredients: [

      {
        kind:
          "group",

        group:
          "ANY_PLANK",

        count:
          3
      },

      {
        kind:
          "item",

        item:
          "stick",

        count:
          2
      }
    ]
  },


  // ===================================================
  // Stone Pickaxe
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
        kind:
          "item",

        item:
          "cobblestone",

        count:
          3
      },

      {
        kind:
          "item",

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
    CRAFTING_KNOWLEDGE[
      item
    ] ??
    null
  );
}


// =====================================================
// Has Knowledge
// =====================================================

export function hasCraftingKnowledge(
  item: string
): boolean {

  return !!getCraftRecipe(
    item
  );
}