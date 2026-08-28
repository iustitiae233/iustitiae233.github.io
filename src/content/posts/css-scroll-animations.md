---
title: CSS 滚动驱动动画：不写 JS 的进度条与视差
description: animation-timeline 实战，以及为什么它天生符合 GPU 合成层铁律。
pubDate: 2026-08-18
updatedDate: 2026-08-20
heroImage: /images/hero-css.jpg
---

这篇文章顶部的阅读进度条，没有一行 JavaScript。
它靠的是 CSS 滚动驱动动画（Scroll-Driven Animations）。

## 原理

传统动画沿**时间轴**推进，滚动驱动动画沿**滚动轴**推进。
把 `animation-timeline` 指向 `scroll()`，浏览器的合成器线程就接管了一切：

```css
.reading-progress {
  position: fixed;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  transform-origin: 0 50%;
  animation: grow-progress linear forwards;
  animation-timeline: scroll(root);
}

@keyframes grow-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
```

注意关键细节：动画的是 `transform: scaleX()`，不是 `width`。

## 为什么这很重要

| 属性 | 渲染阶段 | 线程 | 掉帧风险 |
| --- | --- | --- | --- |
| `width` | Layout → Paint → Composite | 主线程 | 高 |
| `transform` | Composite | 合成器线程 | 极低 |

`transform` 和 `opacity` 是仅有的两个跳过布局与绘制、
直接在 GPU 合成层处理的属性。滚动驱动动画 + `transform`，
意味着即使主线程被长任务卡住，进度条依然丝滑。

## 兼容性与降级

不支持 `animation-timeline` 的浏览器会直接忽略整条动画，
进度条保持 `scaleX(0)` 的初始状态 —— 功能性损失为零，
只是少了一条装饰。渐进增强的理想形态：

- 新浏览器：丝滑进度条
- 旧浏览器：什么都没发生，也不报错

```css
@supports (animation-timeline: scroll()) {
  .reading-progress { display: block; }
}
```

用 `@supports` 包一层，语义更明确。

*零 JS、零掉帧、零兼容性爆炸 —— 这就是原生 CSS 的胜利。*
