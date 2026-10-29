// The ordered stages clients see. Each sub is [shop status key, label].
export const STAGES = [
  { key: 'quoted', label: 'Quoted', ko: '견적', short: 'Quote', subs: [['quoted', 'Awaiting PO']] },
  { key: 'material', label: 'Material', ko: '자재', short: 'Matl', subs: [['checking_stock', 'Checking stock'], ['waiting_material', 'Waiting material']] },
  { key: 'preparing', label: 'Preparing', ko: '준비', short: 'Prep', subs: [['programming', 'Programming'], ['setup', 'Setup']] },
  { key: 'machining', label: 'Machining', ko: '가공', short: 'Mach', subs: [['running_machine_a', 'Machine A'], ['running_machine_d', 'Machine D'], ['running_manual', 'Manual']] },
  { key: 'outside', label: 'Outside finishing', ko: '외주', short: 'Out', subs: [['at_subvendor', 'At subvendor'], ['waiting_finish', 'Waiting finish']] },
  { key: 'finishing', label: 'Finishing', ko: '마무리', short: 'Fin', subs: [['deburr_clean', 'Deburr & clean']] },
  { key: 'inspection', label: 'Inspection', ko: '검사', short: 'QA', subs: [['qa', 'QA check']] },
  { key: 'packing', label: 'Packing', ko: '포장', short: 'Pack', subs: [['packing', 'Packing']] },
  { key: 'done', label: 'Done', ko: '완료', short: 'Done', subs: [['done', 'Done']] },
  { key: 'delivered', label: 'Delivered', ko: '배송', short: 'Deliv', subs: [['delivered', 'Delivered']] },
  { key: 'invoiced', label: 'Invoiced', ko: '청구', short: 'Inv', subs: [['invoiced', 'Invoiced']] },
];

// -1 for 'open': a job in the shop with no stage chosen yet lights no segment.
export const stageOfStatus = (status) =>
  STAGES.findIndex((stage) => stage.subs.some(([key]) => key === status));

export function chipText(status) {
  const index = stageOfStatus(status);
  if (index === -1) return 'In the shop';
  const stage = STAGES[index];
  if (stage.subs.length === 1) return stage.label;
  return `${stage.label} · ${stage.subs.find(([key]) => key === status)[1]}`;
}
