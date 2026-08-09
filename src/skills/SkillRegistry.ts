import type { Skill } from "./Skill";
import { GotoPositionSkill } from "./movement/GotoPositionSkill";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill<any>>();

  constructor() {
    this.register(new GotoPositionSkill());
  }

  register(skill: Skill<any>): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }

    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill<any> | undefined {
    return this.skills.get(name);
  }

  list(): string[] {
    return [...this.skills.keys()].sort();
  }
}
