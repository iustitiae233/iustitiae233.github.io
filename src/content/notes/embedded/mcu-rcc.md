---
title: '时钟树与RCC配置详解'
description: ''
pubDate: '2026-10-16 09:00:00'
category: embedded
tags: [RCC, 时钟树, 时钟配置]
---

## 引言

F103 手册标称最高 72 MHz，芯片上电后却默认跑在 8 MHz。要让 CPU、外设、总线各自工作在目标频率，需要先把时钟树配置好。串口乱码、定时器周期不对、ADC 采样漂移、USB 枚举失败，往回查大多与时钟配置有关。

时钟树是一切时序的基准：外设寄存器的访问时间、波特率发生器的分频、指令的执行耗时，都从这棵树上取得节拍。这页笔记把 RM0008 第 7 章的那张大图拆开讲清楚。

## 一、四个时钟源

| 源 | 频率 | 精度 | 用途 |
| --- | --- | --- | --- |
| **HSE**（高速外部） | 4–16 MHz 晶振 | 石英级，±几十 ppm | PLL 倍频的输入，主时钟源 |
| **HSI**（高速内部） | 8 MHz RC | 出厂校准 ±1%（25 °C），全温漂 ±3~4% | 上电默认时钟，可省去晶振 |
| **LSE**（低速外部） | 32.768 kHz 晶振 | 石英级，适合走时 | RTC 时钟源 |
| **LSI**（低速内部） | 约 40 kHz RC | 偏差大（30–60 kHz） | 独立看门狗 IWDG、RTC 掉电时的后备 |

精度差是 RC 与石英的物理差异。异步串口收发要求两端累计误差在 ±2~3% 以内，HSI 勉强满足；USB 时钟要求 **±0.25%**，HSI 达不到，因此 USB 应用必须使用 HSE 晶振经 PLL 提供时钟。

外部时钟的接法在手册里画得很清楚：

![[rcc-hse-lse-sources.webp|HSE/LSE 时钟源的硬件配置（RM0008 Figure 9）：左图外部时钟信号直接进 OSC_IN、OSC_OUT 悬空（HiZ）；右图晶体跨接 OSC_IN/OSC_OUT，两侧各挂负载电容 CL1/CL2 到地]]

有源晶振输出接 OSC_IN、OSC_OUT 悬空；无源晶体跨接两个 OSC 引脚，并配一对负载电容（典型 10–22 pF，按晶振规格计算）。晶体和电容要紧贴引脚布局，走线过长会导致起振慢、启动不稳，这是硬件布局中少数不能妥协的地方。

LSE 走时的算术：32.768 kHz = 2¹⁵，经 15 级二分频恰好得到 1 Hz，手表晶振选用这个频率就是为了便于分频。

## 二、时钟树全貌

![[rcc-clock-tree.webp|STM32F1 时钟树（RM0008 Figure 8）：左侧四路时钟源经 PLL 倍频（×2~×16）进入 SW 多路选择器选出 SYSCLK，经 AHB 预分频（/1~/512）得 HCLK，再经 APB1/APB2 预分频送往各外设域；分支包括 RTC、IWDG、ADC 预分频（ADCCLK ≤ 14 MHz）、USB 预分频（/1.5 得 48 MHz）、MCO 输出、SysTick（HCLK/8）]]

按最经典的 72 MHz 配置走一遍主干：

| 节点 | 来源 | 频率 | 上限 |
| --- | --- | --- | --- |
| HSE | 8 MHz 晶振 | 8 MHz | 25 MHz |
| PLL | HSE ×9 | 72 MHz | 72 MHz |
| SYSCLK | SW 选 PLL | 72 MHz | 72 MHz |
| HCLK | AHB /1 | 72 MHz | 72 MHz |
| PCLK1 | APB1 /2 | 36 MHz | **36 MHz** |
| PCLK2 | APB2 /1 | 72 MHz | 72 MHz |
| ADCCLK | PCLK2 /6 | 12 MHz | **14 MHz** |
| USBCLK | PLL /1.5 | 48 MHz | 必须 48 MHz |

三个时钟名字要分清：**HCLK** 供给 CPU 内核、SRAM、DMA 和总线矩阵，决定代码执行速度（[[mcu-dma]] 中的外设数据搬运也以它为基准）；**FCLK** 是 Cortex-M3 的自由运行时钟，DWT 计数和 __NOP 级时序使用它；**PCLK1/PCLK2** 是两条 APB 外设总线的时钟，外设寄存器访问时序由它决定，[[mcu-communication-protocols]] 里串口、SPI 的波特率发生器也从它分频。

时钟树里有一条容易忽略的规则——**定时器倍频**（图中 TIMxCLK 框有标注）：

> APB 预分频 = 1 时，定时器时钟 = PCLK；预分频 ≠ 1 时，定时器时钟 = PCLK ×2。

因此在 72/36/72 布局下，挂在 APB1（36 MHz）的 TIM2~TIM7 实际工作在 72 MHz，与 APB2 上的定时器相同。计算 PWM 频率或 [[mcu-timer-interrupt]] 的中断周期时若用错基准，结果会差一倍。

## 三、PLL 与 Flash 等待周期

SYSCLK 有三条来源：HSI、HSE、PLLCLK，由 SW 位选择。PLL 是唯一的升频手段，F1 的规则如下：

* 输入先经 PLLSRC 选择（HSE 或 HSI/2），再经 PLLXTPRE 可选 /2
* 倍频系数 PLLMUL：×2 ~ ×16
* **HSI 做 PLL 输入时 SYSCLK 上限为 64 MHz**（RM0008 Figure 8 脚注 1，RC 源抖动大，达不到 72）
* 需要 72 MHz 时，只能采用 HSE ×9、HSE ×12（6 MHz 晶振）这类组合

72 MHz 还有一个必须同时配置的参数：**Flash 等待周期**。Flash 读取速度跟不上内核时序，48–72 MHz 区间必须配置 2 个等待周期（LATENCY=2），否则取指会偶发出错，表现为无规律的 HardFault。时钟配对了但 Flash 没配，同样会出问题。`HAL_RCC_ClockConfig()` 的第二个参数就是设置它的，不能传 0。

## 四、外设时钟开关

RCC 除了分频，还负责外设时钟的开关：每个外设对应 RCC_APB1ENR/APB2ENR 中的一个时钟使能位，复位后默认全部关闭。由此有三点：

* 使用外设前必须先使能其时钟，否则寄存器写不进、读回全为 0
* GPIO 也有时钟使能位（F1 上挂在 APB2），配置引脚前先调用 `__HAL_RCC_GPIOA_CLK_ENABLE()`，见 [[mcu-gpio]]
* 低功耗设计则相反：不用的外设时钟关掉，[[mcu-adc]] 这类模拟外设关钟还能减少数字噪声串扰

配置流程固定为三步：开时钟 →（需要时）复位外设 → 配置寄存器。

## 五、CSS 与 MCO

**CSS（时钟安全系统）**：当 HSE 因虚焊、受激停振或温漂而失效时，硬件自动把 SYSCLK 切换到 HSI，并触发 NMI 中断。汽车、工业场合建议常开，只需一行 `HAL_RCC_EnableCSS()`，并在 NMI 中做降级处理（关闭高速外设、记录故障码）。

**MCO（时钟输出）**：PA8 可以输出 SYSCLK/HSI/HSE/PLL÷2，用示波器直接测量，即可确认时钟树配置是否正确。

## 六、HAL 配置示例

72 MHz 标准配置，逐行对照第二节的表：

```c
void SystemClock_Config(void)
{
    // 1. 振荡器：HSE 晶振 + PLL 倍频
    RCC_OscInitTypeDef osc = {0};
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    osc.HSEState = RCC_HSE_ON;
    osc.HSEPredivValue = RCC_HSE_PREDIV_DIV1;   // HSE 不预分频，直接输入 PLL
    osc.PLL.PLLState = RCC_PLL_ON;
    osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    osc.PLL.PLLMUL = RCC_PLL_MUL9;              // 8 MHz × 9 = 72 MHz
    HAL_RCC_OscConfig(&osc);                    // 内部等 HSE 就绪、锁 PLL

    // 2. 总线分频
    RCC_ClkInitTypeDef clk = {0};
    clk.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                    RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK; // SW 切到 PLL
    clk.AHBCLKDivider = RCC_SYSCLK_DIV1;        // HCLK  = 72 MHz
    clk.APB1CLKDivider = RCC_HCLK_DIV2;         // PCLK1 = 36 MHz（定时器 ×2 回 72）
    clk.APB2CLKDivider = RCC_HCLK_DIV1;         // PCLK2 = 72 MHz
    HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_2); // 48-72 MHz 必须 2 等待周期

    // 3. 时钟安全与验证
    HAL_RCC_EnableCSS();                        // HSE 失效 → 自动切 HSI + NMI
    // MCO 输出到 PA8（可选）：示波器实测 SYSCLK
}
```

跑起来后用 `HAL_RCC_GetSysClockFreq()` / `GetHCLKFreq()` / `GetPCLK1Freq()` 打印核对，或用 MCO 配合示波器实测。配置完成后必须验证，省略这一步，后续的偶发问题都要回头排查。

## 七、常见问题与注意事项

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| 外设寄存器写不进、读全 0 | 外设时钟没开 | 用前使能时钟，GPIO 也不例外 |
| 串口乱码 | 实际晶振频率与代码假设不符（12 MHz 板按 8 MHz 配置） | MCO/示波器核对，修改 `HSE_VALUE` |
| SYSCLK 无法达到 72 MHz | HSI 做 PLL 输入上限 64 MHz | 72 MHz 必须以 HSE 为输入 |
| 偶发 HardFault | Flash 等待周期没配 | `FLASH_LATENCY_2` |
| ADC 采样值异常 | ADCCLK 超过 14 MHz | 在 PCLK2 基础上配 /4 /6 /8 |
| 延时忽快忽慢 | SysTick 源（HCLK/8 与 HCLK）与重装值不匹配 | 统一基准，重算 reload |
| 低功耗电流降不下去 | 外设时钟全开着 | 按实际用到的外设逐个关闭 |
| RTC 走时不准 | 用了 LSI 兜底（40 kHz 且偏差大） | 需要精度就使用 LSE 晶振 |

两点工程经验：

* 时钟配置有固定顺序：先配置振荡器，再配置总线，等 HSE 就绪后锁定 PLL，最后切换 SW。HAL 把这套顺序封装在函数里，手写寄存器时顺序错误就是常见问题
* 时钟树配置正确的标志是：每个外设的手册时序参数（建立时间、波特率误差、ADC 上限）都能在自己的 PCLK 上对应。对应不上的配置，测试阶段可用，量产阶段容易出问题

## 总结

时钟树可以理解为芯片的供电分配网络，它由四路时钟源、PLL 倍频、SYSCLK 选择、AHB/APB 预分频和外设时钟使能位组成，最终把不同频率送往 CPU、总线和各外设。把这棵树理清：HSE 从哪里输入、PLL 如何倍频、SYSCLK 如何分到 HCLK/PCLK1/PCLK2、定时器在哪里被 ×2，所有时序问题就有了分析基准。
