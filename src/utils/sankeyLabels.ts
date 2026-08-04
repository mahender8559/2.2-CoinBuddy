export interface SankeySplitLabelData {
  name: string;
  value: number;
  percentage: number;
}

export function buildSankeySplitLabel(name: string, value: number, income: number): SankeySplitLabelData {
  return {
    name,
    value,
    percentage: income > 0 ? (value / income) * 100 : 0,
  };
}
