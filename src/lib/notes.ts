import { sortPostsByDateDesc, type PostLike } from "./posts";

/** 笔记分类：embedded=嵌入式，hardware=硬件基础（固定展示顺序） */
export const NOTE_CATEGORY_VALUES = ["embedded", "hardware"] as const;
export type NoteCategory = (typeof NOTE_CATEGORY_VALUES)[number];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  embedded: "嵌入式",
  hardware: "硬件基础",
};

export interface NoteLike extends PostLike {
  data: PostLike["data"] & { category: NoteCategory };
}

/** 按固定分类顺序分组（跳过空组），组内复用文章的日期降序 */
export function groupNotesByCategory<T extends NoteLike>(
  notes: T[],
): { category: NoteCategory; label: string; notes: T[] }[] {
  return NOTE_CATEGORY_VALUES.map((category) => ({
    category,
    label: NOTE_CATEGORY_LABELS[category],
    notes: sortNotesInCategory(notes, category),
  })).filter((g) => g.notes.length > 0);
}

/** 取某分类的笔记（日期降序）——详情页的上一篇/下一篇只在同分类内取相邻 */
export function notesInCategory<T extends NoteLike>(notes: T[], category: NoteCategory): T[] {
  return sortNotesInCategory(notes, category);
}

function sortNotesInCategory<T extends NoteLike>(notes: T[], category: NoteCategory): T[] {
  return sortPostsByDateDesc(notes.filter((n) => n.data.category === category));
}
