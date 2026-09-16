---
title: '硬件基础笔记总览——从无源器件到有源器件'
description: '硬件基础学习笔记的入口地图：无源器件（二极管/电容/电感）、有源器件（三极管/MOS管/比较器）与电路拓扑应用专题（选型、RC/RL/LC、整流滤波、PCB 布局），用双向链接串联全部笔记'
pubDate: '2026-09-16 10:00:00'
category: hardware
tags: [总览, MOC, 硬件]
---

硬件基础系列的**总览（MOC，Map of Content）**——按器件类型分两组、再按电路专题补一组，每篇的反向链接都会指回这里。

## 一、无源器件——不放大，但各有脾气

- [[diode-basics]]——二极管：PN 结、单向导电，从整流到稳压
- [[capacitor-basics]]——电容：储能与滤波，隔直通交的本质
- [[inductor-basics]]——电感：电磁感应与感抗，LC 滤波的另一半

> 三篇合起来覆盖了最常见的三种无源元件：**二极管管方向、电容管电压、电感管电流**。

## 二、有源器件——小信号撬动大世界

- [[transistor-basics]]——三极管：从小电流控制大电流，放大与开关两种身份
- [[mosfet-basics]]——MOS 管：电压控制的电子开关，电源开关与防反接的常客
- [[comparator-basics]]——比较器：模拟到数字的判决官，注意开漏上拉与迟滞两个坑

## 三、电路拓扑与应用专题——器件放到电路里怎么用

器件知识解决"这是什么"，专题解决"怎么用"。这两组可以当速查手册读，每篇都配了电路图。

**选型与匹配**

- [[capacitor-selection-and-roles]]——电容选型与电路角色：选型十看、核心参数、耦合/去耦/旁路的分工
- [[inductor-selection-and-matching]]——电感选型与阻抗匹配：感抗、Isat，以及 L/Π/T 型 LC 匹配网络

**按器件的电路作用**

- [[rc-circuit-applications]]——RC 电路的八种作用：滤波、延时、积分微分、阻容降压、偏置、消抖、耦合
- [[rl-circuit-applications]]——RL 电路的六种作用：滤波、延时、分压限流、耦合隔直、消尖峰、振荡整形
- [[lc-circuit-applications]]——LC 电路的作用：滤波、谐振与选频

**电源与板级**

- [[rectifier-and-filtering]]——整流与滤波：为什么整流之后还要滤波
- [[pcb-layout-guidelines]]——PCB 布局布线指导：分区、叠层与常见错误

## 阅读顺序建议

无源三篇先读（概念轻、互相独立），有源三篇按 三极管 → MOS管 → 比较器 的顺序更顺——MOS 管与三极管互为对照，比较器则把运放世界的判决逻辑独立出来讲。

第三组是**应用层**，可以按需跳读：做电源先看 [[rectifier-and-filtering]]，做信号链先看 [[rc-circuit-applications]] 与 [[lc-circuit-applications]]，画板之前把 [[pcb-layout-guidelines]] 的检查清单过一遍。
