/** Predefined demo scenarios (statements only; triage remains the source of truth). */
export interface DemoScenario {
  id: 1 | 2 | 3;
  statement: string;
  expectedLevel: 1 | 2 | 3;
}

export const DEMO_SCENARIOS: Record<1 | 2 | 3, DemoScenario> = {
  1: {
    id: 1,
    statement:
      "I have had a mild headache since this morning. I have no fever, no recent injury and no other symptoms.",
    expectedLevel: 1,
  },
  2: {
    id: 2,
    statement:
      "I have had persistent abdominal pain since yesterday. The pain is moderate and has become slightly worse.",
    expectedLevel: 2,
  },
  3: {
    id: 3,
    statement:
      "I have sudden chest pressure, difficulty breathing, sweating and dizziness.",
    expectedLevel: 3,
  },
};
