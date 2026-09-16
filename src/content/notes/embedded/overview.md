---
title: '嵌入式笔记总览——从外设驱动到产品化的学习地图'
description: '嵌入式学习笔记的入口地图：外设（GPIO/定时器/PWM/ADC/通信协议）、FreeRTOS 实时系统、Flash 与 OTA、产品化流程，用双向链接串联全部笔记'
pubDate: '2026-09-16 10:00:00'
category: embedded
tags: [总览, MOC, 嵌入式]
---

这是一份嵌入式学习路线的**总览（MOC，Map of Content）**——每篇笔记都可以从这里出发，每篇笔记的反向链接也都会指回这里。按学习阶段分四组。

## 一、外设驱动——先跟芯片交朋友

一切从引脚开始：

- [[mcu-gpio]]——输入输出的起点，从寄存器到 HAL 库的完整链路
- [[mcu-timer-interrupt]]——定时器与中断：CNT 计数、ARR 定周期、NVIC 管优先级
- [[mcu-outputcompare-inputcapture]]——输出比较与输入捕获，定时器的进阶形态
- [[mcu-pwm]]——脉冲宽度调制：一根信号线控制明暗、转速与角度
- [[mcu-adc]]——模数转换：把模拟世界读进数字系统
- [[mcu-communication-protocols]]——UART / I2C / SPI 三大通信协议的对比与选型

## 二、实时系统——让多任务共处

- [[freertos-config-tasks]]——FreeRTOS 入门：配置项与任务管理的取舍
- [[freertos-semaphore-callback]]——信号量与回调：任务间的对话方式

## 三、存储与升级——设备的一生

- [[flash-partition-ota]]——Flash 分区表、中断向量偏移与 OTA 升级流程
- [[product-numbering-flashing]]——产品为什么要编号、烧录的必要性与流程

## 学习建议

外设六篇相互独立，可按需查阅；FreeRTOS 两篇建议顺序读；Flash/OTA 与产品化偏工程实践，做项目时再看。随手点开图谱（侧栏「关系图谱」）能看到这些笔记如何互相引用。
