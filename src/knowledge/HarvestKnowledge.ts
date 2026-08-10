export interface HarvestSource {
  block: string;
  expectedItem: string;
}


const HARVEST_KNOWLEDGE:
  Record<string, HarvestSource[]> = {

  // ==============================
  // 木头
  // ==============================

  oak_log: [
    {
      block: "oak_log",
      expectedItem: "oak_log"
    }
  ],


  // ==============================
  // 泥土
  //
  // grass_block 优先，因为普通地表
  // 更容易看到和接近。
  // dirt 作为第二来源。
  // ==============================

  dirt: [
    {
      block: "grass_block",
      expectedItem: "dirt"
    },
    {
      block: "dirt",
      expectedItem: "dirt"
    }
  ]
};


export function getHarvestSources(
  item: string
): HarvestSource[] {

  return (
    HARVEST_KNOWLEDGE[item] ?? []
  );
}


export function hasHarvestKnowledge(
  item: string
): boolean {

  return (
    HARVEST_KNOWLEDGE[item] !==
    undefined
  );
}