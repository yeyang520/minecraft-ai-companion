export type ClientCommand =
  | {
      type: "state.get";
      requestId: string;
    }
  | {
      type: "skill.list";
      requestId: string;
    }
  | {
      type: "skill.execute";
      requestId: string;
      skill: string;
      params?: unknown;
    }
  | {
      type: "skill.cancel";
      requestId: string;
    };
