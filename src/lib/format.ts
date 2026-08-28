/** 中文格式：2026 年 8 月 28 日（个位不补零） */
export function formatDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
