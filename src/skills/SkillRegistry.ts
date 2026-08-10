import type { Skill } from "./Skill";
import { GotoPositionSkill } from "./movement/GotoPositionSkill";
import { GotoPlayerSkill } from "./movement/GotoPlayerSkill";
import { FollowPlayerSkill } from "./movement/FollowPlayerSkill";
import {FindBlockSkill} from "./perception/FindBlockSkill";
import {CollectBlockSkill} from "./resource/CollectBlockSkill";
import {FindHarvestSourceSkill} from "./perception/FindHarvestSourceSkill";
import {CollectItemSkill} from "./resource/CollectItemSkill";
import {CheckHarvestToolSkill} from "./perception/CheckHarvestToolSkill";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill<any>>();

  // 创建已有skill
  constructor() {
    this.register(new GotoPositionSkill());
    this.register(new GotoPlayerSkill());
    this.register(new FollowPlayerSkill());
    this.register(new FindBlockSkill());
    this.register(new CollectBlockSkill());
    this.register(new FindHarvestSourceSkill());
    this.register(new CollectItemSkill());
    this.register(new CheckHarvestToolSkill());
  }

  // 注册skill
  register(skill: Skill<any>): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }

    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill<any> | undefined {
    return this.skills.get(name);
  }

  // 查看所有skill
  list(): string[] {
    return [...this.skills.keys()].sort();
  }
}
