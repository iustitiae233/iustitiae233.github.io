export interface ReadingTime {
  minutes: number;
  label: string;
}

/** 中文按 ~300 字/分钟，英文按 ~200 词/分钟，混合累计，下限 1 分钟 */
export function estimateReadingTime(text: string): ReadingTime {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const words = (text.match(/[a-zA-Z]+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(cjk / 300 + words / 200));
  return { minutes, label: `${minutes} 分钟` };
}
