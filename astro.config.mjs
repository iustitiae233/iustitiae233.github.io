// @ts-check
import { defineConfig } from "astro/config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "./src/plugins/remark-wikilinks";

// https://astro.build/config
export default defineConfig({
  // GitHub Pages 用户站点仓 + 自定义域名（沿用旧站 CNAME），根路径部署无 base 前缀
  site: "https://www.iustitiae.top",
  // 分层预取：内容链接 hover（默认），侧栏 6 个主导航链接由 Sidebar.astro 单独
  // 标 data-astro-prefetch="viewport" —— 国内到 GitHub Pages 往返常超过 hover→click
  // 的间隙（移动端干脆没有 hover），常驻视口的侧栏进页面即预取，首次点击也是热的
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
    // throwOnError:false 保证个别坏公式只渲染红色错误文本而不中断构建。
    // wikilinks 在 math 之后 —— 公式已转成 math/inlineMath 节点，扫描不会踩进 $...$
    remarkPlugins: [remarkMath, remarkWikilinks],
    rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
  },
});
