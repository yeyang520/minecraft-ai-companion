import type { Skill } from "./Skill";
import { GotoPositionSkill } from "./movement/GotoPositionSkill";
import { GotoPlayerSkill } from "./movement/GotoPlayerSkill";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill<any>>();

  // 注册已有skill
  constructor() {
    this.register(new GotoPositionSkill());
    this.register(new GotoPlayerSkill());
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
