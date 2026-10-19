---
title: '看门狗与低功耗模式详解'
description: ''
pubDate: '2026-10-17 15:00:00'
category: embedded
tags: [IWDG, 看门狗, 低功耗]
---

## 引言

放到现场的设备有两类失效：**软件失效**——某个未预料的分支让程序卡在死循环里，设备仍在供电但已经不再响应；**电池失效**——72 MHz 满速运行，而 99% 的时间其实在等采样间隔。看门狗处理第一类，低功耗模式处理第二类。

这两件事看起来不相干，但在芯片里处于同一范畴：IWDG 挂在 VDD 域，**在 Stop 和 Standby 模式下仍然运行**。要让电池撑过一整夜，就必须先回答"休眠期间看门狗怎么办"。本文按 IWDG → WWDG → 低功耗三档 → 组合问题的顺序展开。

## 一、IWDG：独立看门狗

![[iwdg-block-diagram.webp|IWDG 功能框图（RM0008 Figure 182）：LSI 40 kHz RC 振荡器经可编程预分频器（/4~/64）喂给 12 位递减计数器，计到 0x000 输出 IWDG 复位；IWDG_KR/IWDG_PR/IWDG_RLR 寄存器经键值解锁访问]]

IWDG 的核心特征是独立：时钟来自 LSI 这个 40 kHz RC 振荡器（[[mcu-rcc]] 中精度最差的一个），与 HSE、PLL、SYSCLK 完全无关，即使整个主时钟树失效，它仍然继续计数。框图是一条单向链：LSI → 预分频器 → 12 位递减计数器 → 计到 0 触发复位。

寄存器访问使用键值（Key Register）防止程序跑飞后误写：写 `0x5555` 解锁 PR/RLR 寄存器，写 `0xAAAA` 喂狗（重装计数器），写 `0xCCCC` 启动。**启动之后没有关停指令**，一旦启动，唯一的操作就是按节奏喂狗。

超时时间见下表（按 40 kHz 标称值计算，LSI 实际存在 30–60 kHz 漂移，应按最坏 30 kHz 留余量）：

| 预分频 | 计数范围 | 最短 | 最长 |
| --- | --- | --- | --- |
| /4 | 12 位 (RL+1) | 0.1 ms | 409.6 ms |
| /8 | 同上 | 0.2 ms | 819.2 ms |
| /16 | 同上 | 0.4 ms | 1638.4 ms |
| /32 | 同上 | 0.8 ms | 3276.8 ms |
| /64 | 同上 | 1.6 ms | **6553.6 ms ≈ 6.55 s** |

F1 的 IWDG 上限就是 6.55 s，无法实现"十分钟无响应才复位"这类宽限，需要自行用定时器搭建。

0.5 s 超时的算例与 HAL：

```c
IWDG_HandleTypeDef hiwdg;

void IWDG_Config(void)
{
    // 40 kHz / 32 = 1250 Hz，0.5 s → 重装 625
    hiwdg.Instance       = IWDG;
    hiwdg.Init.Prescaler = IWDG_PRESCALER_32;   // /32
    hiwdg.Init.Reload    = 625 - 1;             // 625 个计数 → 0.5 s
    HAL_IWDG_Init(&hiwdg);                      // 内部写 0x5555/0xCCCC，看门狗已启动
}

// 主循环或低优先级任务里：
HAL_IWDG_Refresh(&hiwdg);   // 写 0xAAAA，重装计数器
```

喂狗的位置比喂狗本身更重要：**应放在主循环里，而不是高优先级中断中**。看门狗的职责是证明主流程仍在运行；如果在中断里喂狗，主循环已经失效而看门狗仍被喂，它就失去了意义。多任务系统中由最低优先级任务喂狗，或各任务向计数器上报存活、由监控任务汇总后统一喂（任务间报活的方式见 [[freertos-queue-notify]]）。

调试时还有一个常见问题：断点会让 CPU 暂停，但 IWDG 不会停止，单步调试过程中芯片意外复位，原因通常就在这里。在上电初始化中加入调试冻结：

```c
__HAL_DBGMCU_FREEZE_IWDG();   // 内核 halt 时 IWDG 跟着停
```

## 二、WWDG：窗口看门狗

![[wwdg-block-diagram.webp|WWDG 功能框图（RM0008 Figure 183）：来自 RCC 的 PCLK1 经 /4096 预分频再经 WDGTB（1/2/4/8）分频，喂给 7 位递减计数器 T[6:0]；W[6:0] 窗口值与计数器比较，T6 位清零即产生复位；WWDG_CR 的 WDGA 位启动]]

WWDG 与 IWDG 有三个本质区别：

* **时钟源**：PCLK1（主时钟树），并非独立 RC，主时钟停止它也随之停止，独立性为零，换来的是精确的时基
* **计数宽度**：7 位，T[6:0] 从 0x7F 向下计数，**T6 位由 1 变 0（数到 0x3F）立即复位**
* **窗口**：喂得太晚会超时复位，**喂得太早同样会复位**，这是它与 IWDG 最主要的分工差异

![[wwdg-timing.webp|WWDG 时序图（RM0008 Figure 184）：T[6:0] 从 0x40 以上递减，计数大于 W[6:0] 时禁止刷新（刷新即复位），小于窗口且大于 0x3F 时允许刷新；递减到 0x3F 处 T6 清零触发 RESET]]

时序图按下面三步理解：计数器从上往下走，**计数大于窗口值 W 时禁止喂狗**（此时喂狗立即复位，程序跑飞后乱写寄存器恰好落在窗口之外，就会触发复位）；计数落在窗口与 0x3F 之间是合法喂狗区；计数低于 0x3F 则复位。

这种"既不能太早也不能太晚"的约束与触发器的建立/保持时间同类：合法操作必须落在指定窗口内，偏早或偏晚都判为错误。

超时公式（PCLK1 = 36 MHz）：

> tWWDG = 4096 × 2^WDGTB × (T[5:0]+1) / f_PCLK1

| WDGTB | 分频 | 最短 | 最长 |
| --- | --- | --- | --- |
| 0 | /1 | 113 µs | 7.28 ms |
| 1 | /2 | 227 µs | 14.56 ms |
| 2 | /4 | 455 µs | 29.12 ms |
| 3 | /8 | 910 µs | **58.25 ms** |

WWDG 的超时是毫秒级，监视的是"主循环每一圈都在预算时间内完成"，比 IWDG 的"程序仍在运行"严格一个数量级。它还有一项 IWDG 不具备的功能：**提前唤醒中断 EWI**，计数器数到 0x40（复位前的最后一个计数）时先触发中断，进入 ISR 后可以在复位前做一次处理：

```c
WWDG_HandleTypeDef hwwdg;

void WWDG_Config(void)
{
    __HAL_RCC_WWDG_CLK_ENABLE();
    hwwdg.Instance       = WWDG;
    hwwdg.Init.Prescaler = WWDG_PRESCALER_8;    // 4096×8/36 MHz = 910 µs/格
    hwwdg.Init.Counter   = 0x7F;                // 从 127 数起
    hwwdg.Init.Window    = 0x50;                // 窗口 80：喂狗合法区 0x3F..0x50
    hwwdg.Init.EWIMode   = WWDG_EWI_ENABLE;     // 数到 0x40 先中断
    HAL_WWDG_Init(&hwwdg);
}

// 数到 0x40：复位前的最后一次处理机会
void HAL_WWDG_EarlyWakeupCallback(WWDG_HandleTypeDef *hwwdg_)
{
    Log_FaultContext();          // 记故障现场到 RAM/备份寄存器
    HAL_WWDG_Refresh(hwwdg_);    // 需要继续运行就在这里喂狗；需要复位则不执行任何操作
}
```

调试冻结同理：`__HAL_DBGMCU_FREEZE_WWDG()`。

## 三、两种看门狗的选型

| | IWDG | WWDG |
| --- | --- | --- |
| 时钟 | LSI 40 kHz 独立 RC | PCLK1（主时钟树） |
| 时基精度 | 差（30–60 kHz 漂移） | 准 |
| 计数 | 12 位，最长 6.55 s | 7 位，最长 58.25 ms @36 MHz |
| 喂狗时机 | 超时前任意时刻 | **必须落在窗口内** |
| 复位前中断 | 无 | 有（EWI） |
| Stop/Standby 下 | **照跑** | 时钟停，不跑 |
| 典型角色 | 兜底保险："程序还活着" | 精确监控："每圈都在预算内" |

多数项目只用 IWDG 兜底；对时序敏感的控制环（电机、电源）再加 WWDG 监视主循环周期。两者不冲突，可以同时启用。

## 四、低功耗三档：Sleep、Stop、Standby

RM0008 Table 11 一张表说全，按"关掉多少"从轻到重排：

| | Sleep | Stop | Standby |
| --- | --- | --- | --- |
| 关掉了什么 | 仅 CPU 时钟 | 1.8V 域全部时钟 + HSI/HSE 振荡器 | 整个 1.8V 域**断电** |
| SRAM/寄存器 | 保留 | 保留 | **丢失** |
| 唤醒源 | 任意中断（WFI）/ 事件（WFE） | 任意 EXTI 线（含 WKUP 引脚、RTC 闹钟） | 仅 WKUP 上升沿、RTC 闹钟、NRST、IWDG 复位 |
| 唤醒后 | 从暂停处继续跑 | 从暂停处继续跑，但**时钟已是 HSI** | **相当于复位重启**，从头执行 |
| 典型电流（F103 datasheet） | 十几 mA 级 | 14 µA 级 | 2 µA 级 |

三档的用法分界很清楚：

* **Sleep**：功耗降低最少（外设时钟全部保持开启），但进出没有额外开销。在等待某个中断期间可以顺便进入，FreeRTOS 的空闲任务默认就是这样做的，`portSUPPRESS_TICKS_AND_SLEEP`（tickless idle）进一步拉长了 SysTick 的周期性唤醒间隔（相关配置见 [[freertos-config-tasks]]）
* **Stop**：电池设备的主要选择。SRAM 与寄存器内容保留，唤醒后从断点继续执行；代价是唤醒后时钟变为 HSI 8 MHz，**必须重新配置时钟树**
* **Standby**：适用于月级或年级待机。唤醒相当于复位，需要借助备份寄存器或 RTC 闹钟接力保存数据；2 µA 级的电流才能支持"一颗纽扣电池待机一年"

三段进出代码：

```c
// ---- Sleep：等下一条中断 ----
HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI);

// ---- Stop：醒来第一件事是重配时钟（已跌回 HSI 8 MHz）----
HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
SystemClock_Config();     // 重新上 72 MHz，见 mcu-rcc 一篇
// 若用 WKUP/EXTI 唤醒，EXTI 挂起标志记得清

// ---- Standby：进入即相当于复位 ----
__HAL_RCC_PWR_CLK_ENABLE();                  // PWR 外设时钟容易忘记开启
HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1);    // PA0 上升沿唤醒
HAL_PWR_EnterSTANDBYMode();
// 醒来后从 main() 重新开始；查 __HAL_PWR_GET_FLAG(PWR_FLAG_SB)
// 区分"上电"还是"Standby 唤醒"
```

进入 Stop 前还有两件事要做：GPIO 设为模拟输入或上拉（悬空的输入脚会因漏电把 14 µA 抬到几十 µA）；不用的外设时钟全部关闭（见 [[mcu-rcc]] 中的时钟使能配置）。

## 五、看门狗与休眠的组合问题

* **IWDG 在 Stop/Standby 下仍然运行**（它挂在 VDD 域，Figure 182 脚注原文写明）。如果休眠时间要超过 6.55 s（看门狗的最长超时），两者无法同时满足：要么让唤醒周期短于喂狗周期（每个唤醒窗喂一次），要么放弃 IWDG。这是低功耗设计首先要确定的约束
* **WWDG 在 Stop 下自动停止**（PCLK1 停止它也随之停止），所以"Stop 休眠 + WWDG 监视主循环"是天然兼容的组合
* Stop 唤醒后的时钟问题会连锁出现：以 HSI 8 MHz 起步，如果忘记重配，串口波特率全部错误、定时周期全部偏移（表现为"休眠唤醒后就乱"）；重配本身需要时间，不能把高频控制环的截止期限安排在刚唤醒的瞬间
* Standby 唤醒等同于复位：全局变量、任务状态全部清零。FreeRTOS 任务模型在 Standby 下没有意义，只有裸机加备份寄存器/RTC 的"闹钟式"程序结构才适用
* 调试器与低功耗：断点暂停时看门狗仍在运行（除非冻结），Sleep/Stop 还会断开调试口，低功耗联调前先把冻结宏全部打开

## 六、常见问题与注意事项

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| 单步调试到一半芯片复位 | CPU halt，IWDG/WWDG 不停 | `__HAL_DBGMCU_FREEZE_IWDG/WWDG()` |
| 间歇性低功耗设备频繁复位 | Stop 时长 × IWDG 超时没算账 | 唤醒周期 < 超时，每次醒来喂；或弃 IWDG |
| Stop 醒来串口乱码、定时不准 | 时钟跌回 HSI，没重配 | 醒来立即 SystemClock_Config |
| 待机电流远超手册值 | 悬空输入脚漏电 / 外设时钟没关 | GPIO 模拟或上拉，逐个关外设钟 |
| WWDG 无故复位 | 喂狗落在窗口之外（太早也算错） | 用示波器/计数器实测主循环周期再定窗口 |
| IWDG 超时"不准" | LSI 30–60 kHz 漂移没留余量 | 按最坏 30 kHz 设计重装值 |
| 想要分钟级看门狗 | IWDG 上限 6.55 s | 低速定时器 + 计数分频自己搭 |
| 分不清上电还是 Standby 唤醒 | 两者都从 main 开始 | 查 PWR_FLAG_SB / 备份寄存器签名 |

## 总结

IWDG 用独立 RC 为"程序仍在运行"兜底，最长 6.55 s，启动后无法关闭；WWDG 用 PCLK1 监视"每圈是否准时"，窗口之外喂狗同样算错误，EWI 提供一次复位前的处理机会。低功耗三档按关闭范围递进：Sleep 关闭 CPU 时钟、Stop 关闭时钟并保留 SRAM、Standby 直接断电重启，唤醒方式与代价各不相同。组合使用时有一条硬约束：**IWDG 在休眠期间不会停止，因此休眠周期必须迁就喂狗周期**。
