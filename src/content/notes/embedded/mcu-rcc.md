---
title: '时钟树与RCC配置详解'
description: ''
pubDate: '2026-10-16 09:00:00'
category: embedded
tags: [RCC, 时钟树, 时钟配置]
---

## 引言

F103 手册写着"最高 72 MHz"，芯片上电却只跑在 8 MHz——想让 CPU、外设、总线各就各位，得先把时钟树配起来。串口乱码、定时器周期不对、ADC 采样漂、USB 枚举失败，十有八九往回查都是时钟的账。

时钟树不难，但它是**一切时序的地基**：每条外设的寄存器访问时间、每个波特率发生器的分频、每段汇编的执行耗时，全部从这棵树上取节拍。这页笔记把 RM0008 第 7 章的那张大图拆开讲清楚。

## 一、四个时钟源

| 源 | 频率 | 精度 | 用途 |
| --- | --- | --- | --- |
| **HSE**（高速外部） | 4–16 MHz 晶振 | 石英级，±几十 ppm | PLL 倍频的种子，正经主时钟 |
| **HSI**（高速内部） | 8 MHz RC | 出厂校准 ±1%（25 °C），全温漂 ±3~4% | 上电默认时钟、省晶振的场合 |
| **LSE**（低速外部） | 32.768 kHz 晶振 | 手表级 | RTC 走时 |
| **LSI**（低速内部） | 约 40 kHz RC | 很粗（30–60 kHz） | 独立看门狗 IWDG、RTC 掉电兜底 |

精度差是 RC 与石英的物理差距。异步串口收发要求两端累计误差 ±2~3% 以内，HSI 勉强及格；USB 时钟要求 **±0.25%**，HSI 不可能——所以 USB 应用必须上 HSE 晶振走 PLL。

外部时钟怎么接，手册画得很直白：

![[rcc-hse-lse-sources.webp|HSE/LSE 时钟源的硬件配置（RM0008 Figure 9）：左图外部时钟信号直接进 OSC_IN、OSC_OUT 悬空（HiZ）；右图晶体跨接 OSC_IN/OSC_OUT，两侧各挂负载电容 CL1/CL2 到地]]

有源晶振输出接 OSC_IN、OSC_OUT 悬空；无源晶体跨接两个 OSC 引脚，配一对负载电容（典型 10–22 pF，按晶振规格算）。晶体和电容**紧贴引脚布局**，走线长了启动不稳、起振慢，这是硬件布局少数不容商量的事之一。

LSE 走时的算术也顺手记下：32.768 kHz = 2¹⁵，15 级二分频恰好得到 1 Hz——手表晶振选这个数不是巧合。

## 二、时钟树全貌

![[rcc-clock-tree.webp|STM32F1 时钟树（RM0008 Figure 8）：左侧四路时钟源经 PLL 倍频（×2~×16）进入 SW 多路选择器选出 SYSCLK，经 AHB 预分频（/1~/512）得 HCLK，再经 APB1/APB2 预分频送往各外设域；分支包括 RTC、IWDG、ADC 预分频（ADCCLK ≤ 14 MHz）、USB 预分频（/1.5 得 48 MHz）、MCO 输出、SysTick（HCLK/8）]]

顺着图走一遍最经典的 72 MHz 配置主线：

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

三个名字要分清：**HCLK** 喂 CPU 内核、SRAM、DMA、总线矩阵（跑代码的速度）；**FCLK** 是 Cortex-M3 的自由运行时钟（DWT 计数、__NOP 级时序用它）；**PCLK1/PCLK2** 是两条 APB 外设总线的时钟（外设寄存器访问时序由它决定，[[mcu-communication-protocols]] 里串口/SPI 的波特率发生器也从它分频）。

树上藏着一条容易漏的规则——**定时器倍频**（图上 TIMxCLK 框写得很清楚）：

> APB 预分频 = 1 时，定时器时钟 = PCLK；预分频 ≠ 1 时，定时器时钟 = PCLK ×2。

所以 72/36/72 布局下，挂在 APB1（36 MHz）的 TIM2~TIM7 实际跑 **72 MHz**——和 APB2 上的定时器一样快。算 PWM 频率、[[mcu-timer-interrupt]] 的中断周期时用错基准，结果就差一倍。

## 三、PLL 与 Flash 等待周期

SYSCLK 有三条路可走：HSI、HSE、PLLCLK，由 SW 位选择。PLL 是唯一的升频手段，F1 的规矩：

* 输入经 PLLEN 前先过 PLLSRC 选择（HSE 或 HSI/2），再经 PLLXTPRE 可选 /2
* 倍频系数 PLLMUL：×2 ~ ×16
* **HSI 做 PLL 输入时 SYSCLK 上限 64 MHz**（RM0008 Figure 8 脚注 1，RC 源抖动大，跑不满 72）
* 想要 72 MHz，只能 HSE ×9、HSE ×12（6 MHz 晶振）这类组合

72 MHz 还有个隐藏搭子：**Flash 等待周期**。Flash 读取速度跟不上内核时序，48–72 MHz 区间必须配 2 个等待周期（LATENCY=2），否则取指偶发出错，症状是毫无规律的 HardFault——时钟配对了、Flash 没配，一样翻车。`HAL_RCC_ClockConfig()` 的第二个参数就是干这个的，别传 0 了事。

## 四、外设时钟开关

RCC 管的不只是分频，还有**配电**：每个外设一根时钟闸刀（RCC_APBxENR/APB2ENR 里的位），默认全关。三个推论：

* **用外设前先开钟**——寄存器写不进、读回全 0，九成是闸刀没合
* GPIO 也有闸刀（F1 上挂在 APB2），配引脚之前先 `__HAL_RCC_GPIOA_CLK_ENABLE()`
* 低功耗设计反过来做：不用的外设钟关掉，[[mcu-adc]] 这类模拟外设关钟还能消除数字噪声串扰

套路固定三步：开钟 → （需要时）复位外设 → 配寄存器。

## 五、CSS 与 MCO：一守一验

**CSS（时钟安全系统）**：晶振虚焊、受激停振、温漂停摆——HSE 一旦失效，硬件自动把 SYSCLK 切到 HSI 兜底，并触发 NMI 中断。汽车、工业现场建议常开，一行 `HAL_RCC_EnableCSS()` 的事；NMI 里再做降级处理（关高速外设、记故障码）。

**MCO（时钟输出）**：PA8 可以把 SYSCLK/HSI/HSE/PLL÷2 引出来，示波器一搭，时钟树配没配对当场见分晓。配时钟不改代码盲猜，是最贵的调试方式。

## 六、HAL 配置示例

72 MHz 标准配方，逐行对照第二节的表：

```c
void SystemClock_Config(void)
{
    // 1. 振荡器：HSE 晶振 + PLL 倍频
    RCC_OscInitTypeDef osc = {0};
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    osc.HSEState = RCC_HSE_ON;
    osc.HSEPredivValue = RCC_HSE_PREDIV_DIV1;   // HSE 不预分频，直接喂 PLL
    osc.PLL.PLLState = RCC_PLL_ON;
    osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    osc.PLL.PLLMUL = RCC_PLL_MUL9;              // 8 MHz × 9 = 72 MHz
    HAL_RCC_OscConfig(&osc);                    // 内部等 HSE 就绪、锁 PLL

    // 2. 总线分频：树的主干
    RCC_ClkInitTypeDef clk = {0};
    clk.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                    RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK; // SW 切到 PLL
    clk.AHBCLKDivider = RCC_SYSCLK_DIV1;        // HCLK  = 72 MHz
    clk.APB1CLKDivider = RCC_HCLK_DIV2;         // PCLK1 = 36 MHz（定时器 ×2 回 72）
    clk.APB2CLKDivider = RCC_HCLK_DIV1;         // PCLK2 = 72 MHz
    HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_2); // 48-72 MHz 必须 2 等待周期

    // 3. 保险与验证
    HAL_RCC_EnableCSS();                        // HSE 失效 → 自动切 HSI + NMI
    // MCO 输出到 PA8（可选）：示波器实测 SYSCLK
}
```

跑起来后用 `HAL_RCC_GetSysClockFreq()` / `GetHCLKFreq()` / `GetPCLK1Freq()` 打印核对，或 MCO + 示波器——**配完必须验证**，这步省了，后面所有"玄学问题"都在还债。

## 七、常见问题与注意事项

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| 外设寄存器写不进、读全 0 | 外设时钟没开 | 用前开钟，GPIO 也不例外 |
| 串口乱码 | 实际晶振频率与代码假设不符（12 MHz 板按 8 MHz 配） | MCO/示波器核对，改 `HSE_VALUE` |
| SYSCLK 死活上不了 72 | HSI 做 PLL 输入上限 64 MHz | 72 MHz 必须以 HSE 为种子 |
| 偶发 HardFault、跑飞 | Flash 等待周期没配 | `FLASH_LATENCY_2` |
| ADC 采样值异常 | ADCCLK 超过 14 MHz | PCLK2 基础上配 /4 /6 /8 |
| 延时忽快忽慢一档 | SysTick 源（HCLK/8 与 HCLK）与重装值不匹配 | 统一基准，重算 reload |
| 低功耗电流降不下去 | 外设时钟全开着 | 按实际用到的外设逐个关 |
| RTC 走时不准 | 用了 LSI 兜底（40 kHz 且偏差大） | 要准就上 LSE 晶振 |

两点工程直觉：

* 时钟配置的顺序有讲究：**先振荡器后总线，先 HSE 就绪再锁 PLL，最后才切 SW**——HAL 把顺序封在函数里，手写寄存器时这个次序就是坑本身
* 一棵时钟树配平的标志是：每个外设的手册时序参数（建立时间、波特率误差、ADC 上限）都能落到自己的 PCLK 上对上账。对不上账的配置，测试时"能用"，量产必出鬼

## 总结

时钟树是芯片的配电盘：四个源是发电厂，PLL 是升压站，AHB/APB 预分频是各级变电，外设使能位是每户的闸刀。把这棵树读顺——HSE 从哪进、PLL 怎么倍、SYSCLK 怎么分到 HCLK/PCLK1/PCLK2、定时器在哪里偷偷 ×2——所有时序问题就都有了坐标系。[[mcu-gpio]]、[[mcu-timer-interrupt]]、[[mcu-adc]]、[[mcu-dma]] 每一篇的"配前先开钟"，配的都是这棵树。

> *先有稳定的节拍，才有可靠的时序。* —— Iustitiae
