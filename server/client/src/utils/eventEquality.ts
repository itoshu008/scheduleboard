export type SEvent = {
  id: number | string;
  title?: string;
  color?: string | null;
  start?: string;
  end?: string;
  start_datetime?: string;
  end_datetime?: string;
  employee_id?: number | null;
  equipment_id?: number | null;
  updated_at?: string | null;
  created_at?: string;
};

const getStart = (e: SEvent) => e.start ?? e.start_datetime ?? '';
const getEnd   = (e: SEvent) => e.end   ?? e.end_datetime   ?? '';

export const eventKey = (e: SEvent) =>
  `${e.id}|${getStart(e)}|${getEnd(e)}|${e.title ?? ''}|${e.color ?? ''}|${e.employee_id ?? ''}|${e.equipment_id ?? ''}|${e.updated_at ?? ''}|${e.created_at ?? ''}`;

export function upsertEventIfChanged<T extends SEvent>(prevList: T[], next: T): T[] {
  const i = prevList.findIndex(x => x.id === next.id);
  if (i === -1) return [...prevList, next];
  const prevKey = eventKey(prevList[i]);
  const nextKey = eventKey(next);
  if (prevKey === nextKey) return prevList;  // ← 完全同一なら"同じ配列参照"を返してレンダ抑止
  const copy = prevList.slice();
  copy[i] = next;
  return copy;
}
