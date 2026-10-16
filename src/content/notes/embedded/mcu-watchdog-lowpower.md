---
title: '看门狗与低功耗模式详解'
description: ''
pubDate: '2026-10-17 15:00:00'
category: embedded
tags: [IWDG, 看门狗, 低功耗]
---

## 引言

放到现场去的设备有两种死法：**软件死**——某个没料到的分支让程序卡进死循环，设备还亮着灯但已经人事不省；**电池死**——72 MHz 满速跑着，明明 99% 的时间在等采样间隔。看门狗治第一种，低功耗模式治第二种。

这两件事乍看不相干，其实在芯片里共处一栏：IWDG 挂在 VDD 域，**Stop 和 Standby 模式下照跑不误**——想让电池活过夜，就得先回答"睡着的时候狗怎么办"。这页笔记按 IWDG → WWDG → 低功耗三档 → 组合坑的顺序讲。

## 一、IWDG：独立看门狗

![[iwdg-block-diagram.webp|IWDG 功能框图（RM0008 Figure 182）：LSI 40 kHz RC 振荡器经可编程预分频器（/4~/64）喂给 12 位递减计数器，计到 0x000 输出 IWDG 复位；IWDG_KR/IWDG_PR/IWDG_RLR 寄存器经键值解锁访问]]

IWDG 的设计哲学是**独立**：时钟来自 LSI 这个 40 kHz RC 小振荡器（[[mcu-rcc]] 里精度最差的那个），与 HSE、PLL、SYSCLK 完全无关——主时钟树整个崩了，它照数不误。框图一条链：LSI → 预分频器 → 12 位递减计数器 → 计到 0 就复位。

寄存器访问用键值（Key Register）防程序跑飞后误写：写 `0x5555` 解锁 PR/RLR 寄存器，写 `0xAAAA` 喂狗（重装计数器），写 `0xCCCC` 启动。**启动之后没有关停指令**——狗一旦放出来，唯一的选择就是按节奏喂它。

超时公式一张表说全（40 kHz 标称值，LSI 实际 30–60 kHz 漂移，按最坏 30 kHz 留余量）：

| 预分频 | 计数范围 | 最短 | 最长 |
| --- | --- | --- | --- |
| /4 | 12 位 (RL+1) | 0.1 ms | 409.6 ms |
| /8 | 同上 | 0.2 ms | 819.2 ms |
| /16 | 同上 | 0.4 ms | 1638.4 ms |
| /32 | 同上 | 0.8 ms | 3276.8 ms |
| /64 | 同上 | 1.6 ms | **6553.6 ms ≈ 6.55 s** |

F1 的 IWDG 上限就是 6.55 s——想要"十分钟没响应才复位"这种宽限，它给不了，得用定时器自己搭。

0.5 s 超时的算例与 HAL：

```c
IWDG_HandleTypeDef hiwdg;

void IWDG_Config(void)
{
    // 40 kHz / 32 = 1250 Hz，0.5 s → 重装 625
    hiwdg.Instance       = IWDG;
    hiwdg.Init.Prescaler = IWDG_PRESCALER_32;   // /32
    hiwdg.Init.Reload    = 625 - 1;             // 625 个计数 → 0.5 s
    HAL_IWDG_Init(&hiwdg);                      // 内部写 0x5555/0xCCCC，狗已上路
}

// 主循环或低优先级任务里：
HAL_IWDG_Refresh(&hiwdg);   // 写 0xAAAA，重装计数器
```

喂狗的位置比喂狗本身重要：**放在主循环里，不放进高优先级中断**。狗的职责是证明"主流程还活着"——中断里喂狗，主循环死了狗照样吃得饱，等于没养。多任务下放最低优先级任务喂，或各任务报活到计数器、由监工任务汇总喂。

调试时还有一只拦路虎：断点停下 CPU，IWDG 不停——单步调试到一半芯片莫名复位，就是它。上电初始化里加一行调试冻结：

```c
__HAL_DBGMCU_FREEZE_IWDG();   // 内核 halt 时 IWDG 跟着停
```

## 二、WWDG：窗口看门狗

![[wwdg-block-diagram.webp|WWDG 功能框图（RM0008 Figure 183）：来自 RCC 的 PCLK1 经 /4096 预分频再经 WDGTB（1/2/4/8）分频，喂给 7 位递减计数器 T[6:0]；W[6:0] 窗口值与计数器比较，T6 位清零即产生复位；WWDG_CR 的 WDGA 位启动]]

WWDG 与 IWDG 的三个本质区别：

* **时钟源**：PCLK1（主时钟树），不是独立 RC——主时钟停了它就停，"独立性"为零，换来的是时基精确
* **计数宽度**：7 位，T[6:0] 从 0x7F 往下数，**T6 位从 1 变 0（数到 0x3F）立刻复位**
* **窗口**：太晚喂会咬（超时），**太早喂也咬**——这是它与 IWDG 最大的分工差异

![[wwdg-timing.webp|WWDG 时序图（RM0008 Figure 184）：T[6:0] 从 0x40 以上递减，计数大于 W[6:0] 时禁止刷新（刷新即复位），小于窗口且大于 0x3F 时允许刷新；递减到 0x3F 处 T6 清零触发 RESET]]

时序图读三遍就顺了：计数器从上往下走，**走在窗口值 W 之上时禁止喂狗**（喂了立即复位——程序跑飞后乱写寄存器，恰好撞上窗口外的刷新，狗反手一个复位）；走在窗口与 0x3F 之间是合法喂狗区；数穿 0x3F，复位。

超时公式（PCLK1 = 36 MHz）：

> tWWDG = 4096 × 2^WDGTB × (T[5:0]+1) / f_PCLK1

| WDGTB | 分频 | 最短 | 最长 |
| --- | --- | --- | --- |
| 0 | /1 | 113 µs | 7.28 ms |
| 1 | /2 | 227 µs | 14.56 ms |
| 2 | /4 | 455 µs | 29.12 ms |
| 3 | /8 | 910 µs | **58.25 ms** |

毫秒级——WWDG 盯的是"主循环每一圈都在预算时间内跑完"，比 IWDG 的"程序还活着"严格一个量级。它还有一个 IWDG 没有的宝贝：**提前唤醒中断 EWI**——计数器数到 0x40（复位前最后一个计数）时先触发中断，进 ISR 后可以在复位前抢救一把：

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

// 数到 0x40：复位前最后的抢救窗口
void HAL_WWDG_EarlyWakeupCallback(WWDG_HandleTypeDef *hwwdg_)
{
    Log_FaultContext();          // 记故障现场到 RAM/备份寄存器
    HAL_WWDG_Refresh(hwwdg_);    // 想继续活就在这喂；想复位就什么都不做
}
```

调试冻结同理：`__HAL_DBGMCU_FREEZE_WWDG()`。

## 三、两只狗怎么选

| | IWDG | WWDG |
| --- | --- | --- |
| 时钟 | LSI 40 kHz 独立 RC | PCLK1（主时钟树） |
| 时基精度 | 差（30–60 kHz 漂移） | 准 |
| 计数 | 12 位，最长 6.55 s | 7 位，最长 58.25 ms @36 MHz |
| 喂狗时机 | 超时前任意时刻 | **必须落在窗口内** |
| 复位前中断 | 无 | 有（EWI） |
| Stop/Standby 下 | **照跑** | 时钟停，不跑 |
| 典型角色 | 兜底保险："程序还活着" | 精确监控："每圈都在预算内" |

多数项目只用 IWDG 兜底；对时序敏感的控制环（电机、电源）加 WWDG 圈住主循环周期。两只狗不冲突，可以同时养。

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

* **Sleep**：省得最少（外设时钟全开着），但进出零成本。等待某个中断期间顺手睡一下，FreeRTOS 的空闲任务默认就在做这件事——`portSUPPRESS_TICKS_AND_SLEEP`（tickless idle）进一步把 SysTick 的周期性唤醒也拉长
* **Stop**：电池设备的正主。SRAM 保住、寄存器保住，醒来从断点继续；代价是醒来时钟变成 HSI 8 MHz，**必须重配时钟树**
* **Standby**：月级/年级待机。醒来即复位，用备份寄存器或 RTC 闹钟接力数据；2 µA 级电流才撑得起"一颗纽扣电池待机一年"

三段进出代码：

```c
// ---- Sleep：等下一条中断 ----
HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI);

// ---- Stop：醒来第一件事是重配时钟（已跌回 HSI 8 MHz）----
HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);
SystemClock_Config();     // 重新上 72 MHz，见 mcu-rcc 一篇
// 若用 WKUP/EXTI 唤醒，EXTI 挂起标志记得清

// ---- Standby：一睡就是复位 ----
__HAL_RCC_PWR_CLK_ENABLE();                  // PWR 外设时钟常忘开
HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1);    // PA0 上升沿唤醒
HAL_PWR_EnterSTANDBYMode();
// 醒来后从 main() 重新开始；查 __HAL_PWR_GET_FLAG(PWR_FLAG_SB)
// 区分"上电"还是"Standby 唤醒"
```

进 Stop 前还有两件家务：GPIO 设成模拟输入或上拉（悬空的输入脚会因漏电把 14 µA 吃成几十 µA）；不用的外设时钟全部关掉（[[mcu-rcc]] 的配电闸刀）。

## 五、狗与睡眠同栏：组合的坑

* **IWDG 在 Stop/Standby 里照跑**（它挂在 VDD 域，Figure 182 脚注原文写明）。想睡超过 6.55 s——狗的最长超时——那就没有两全：要么睡醒周期短于喂狗周期（每个唤醒窗喂一次），要么这个项目放弃 IWDG。**这是低功耗设计的第一道算术题**
* **WWDG 在 Stop 里自动停**（PCLK1 停了它跟着停），所以"Stop 睡 + WWDG 盯主循环"是天然兼容的组合
* Stop 醒来的时钟坑连环：HSI 8 MHz 起步 → 忘了重配，串口波特率全错、定时周期全飘（症状是"睡一觉起来就乱了"）；重配本身要时间，别把高频控制环的截止期限指望在刚醒那一瞬间
* Standby 唤醒 = 复位：全局变量、任务状态全清零。FreeRTOS 任务模型在 Standby 下无意义，只有裸机 + 备份寄存器/RTC 的"闹钟式"程序结构才配它
* 调试器 + 低功耗：断点停着时狗在跑（除非冻结），Sleep/Stop 还会把调试口弄丢——低功耗联调先把冻结宏开齐

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

IWDG 用独立 RC 兜底"程序活着"，最长 6.55 s、启动后不能关；WWDG 用 PCLK1 圈住"每圈准时"，窗口外的喂狗也算病，EWI 给一次临终抢救。低功耗三档按"关掉多少"递进——Sleep 关 CPU、Stop 关时钟保 SRAM、Standby 直接断电重来，醒来方式与代价各不相同。组合时记住那条硬约束：**IWDG 不睡觉，所以睡眠周期必须迁就喂狗周期**。时钟从哪来（[[mcu-rcc]]）、任务怎么歇（[[freertos-config-tasks]] 的 tickless idle）、醒来后数据怎么交（[[freertos-queue-notify]]），三篇串起来就是一台电池设备的完整生存手册。

> *看门狗防的是程序装死，低功耗防的是电池真死。* —— Iustitiae
