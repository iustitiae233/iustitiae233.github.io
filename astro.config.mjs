// @ts-check
import { defineConfig } from "astro/config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// https://astro.build/config
export default defineConfig({
  // GitHub Pages 用户站点仓（iustitiae233.github.io）——根路径部署，无 base 前缀
  site: "https://iustitiae233.github.io",
  // 全站链接 hover 即预取目标页 —— 点击瞬间渲染，感知性能的最大杠杆
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  markdown: {
    shikiConfig: {
      theme: "one-dark-pro",
      wrap: true,
    },
    // 硬件笔记含大量 LaTeX 公式；strict:false 容忍 \text{V}、\sim 等写法，
    // throwOnError:false 保证个别坏公式只渲染红色错误文本而不中断构建
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
  },
});
