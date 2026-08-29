---
title: '单片机GPIO原理与实战——从寄存器到HAL库'
description: ''
pubDate: '2026-06-27 10:00:00'
category: embedded
---

## 引言

GPIO（General Purpose Input/Output，通用输入输出）是单片机最基础也最常用的外设。无论是点亮一颗LED、读取一个按键，还是驱动复杂的通信总线，都离不开对GPIO的理解。

> 如果说单片机是一个微型计算机，那么GPIO就是它与物理世界对话的窗口。

## 一、GPIO 内部结构

STM32 的每个 I/O 引脚内部包含以下关键电路：

结构功能**保护二极管**防止引脚电压高于 VDD 或低于 VSS，保护芯片**上拉/下拉电阻**内部弱电阻（约 30~50kΩ），可通过寄存器配置**施密特触发器**将模拟信号整形成数字 0/1，输入模式下开启**P-MOS + N-MOS 管**实现推挽输出和开漏输出的核心驱动电路**输入数据寄存器 (IDR)**每个 AHB 时钟周期采样一次引脚电平**输出数据寄存器 (ODR)**控制输出电平状态**位设置/清除寄存器 (BSRR)**原子操作 ODR 的各个位，不会被中断打断

## 二、8 种 GPIO 工作模式

### 📥 4 种输入模式

1. 浮空输入（Input Floating）

* 上拉和下拉电阻**均断开**
* 引脚悬空时电平不确定，易受外部噪声干扰
* **典型应用**：I2C、USART 的 RX 端、ADC 输入

2. 上拉输入（Input Pull-Up）

* 内部**上拉电阻接通**到 VDD
* 引脚悬空时保持**高电平**
* **典型应用**：按键检测（按键接地，平时高电平，按下低电平）

3. 下拉输入（Input Pull-Down）

* 内部**下拉电阻接通**到 VSS
* 引脚悬空时保持**低电平**
* **典型应用**：按键检测（按键接 VDD，平时低电平，按下高电平）

4. 模拟输入（Analog）

* 上拉/下拉断开，施密特触发器关闭
* 电压信号直接传入 ADC 模块
* **典型应用**：ADC 电压采集、省电模式下的未用引脚

### 📤 4 种输出模式

5. 推挽输出（Push-Pull）

* **P-MOS + N-MOS 双管工作**：输出 1 时 P-MOS 导通，输出 0 时 N-MOS 导通
* 驱动能力强，上升沿速度快
* **典型应用**：LED 驱动、普通 GPIO 输出

6. 开漏输出（Open-Drain）

* **只有 N-MOS 管工作**：输出 0 强拉到地，输出 1 需外部上拉
* 具备**线与**功能，可实现电平转换
* **典型应用**：I2C 总线、电平不匹配场合

7. 复用推挽输出（AF Push-Pull）

* 与推挽输出相同，但信号源来自片上外设（SPI、USART、定时器）
* **典型应用**：USART TX、SPI MOSI/SCK

8. 复用开漏输出（AF Open-Drain）

* 与开漏输出相同，信号源来自片上外设
* **典型应用**：I2C SCL/SDA

## 三、推挽 vs 开漏 —— 核心对比

特性推挽输出开漏输出驱动管P-MOS + N-MOS仅 N-MOS输出高电平**强高电平**（芯片内部驱动）**需外部上拉电阻**输出低电平强低电平强低电平电平转换不支持**支持**线与功能不支持（短路风险）**支持**典型应用LED、普通 IOI2C、电平匹配

## 四、关键寄存器速查

寄存器功能**GPIOx\_CRL/CRH**配置引脚模式（每 4 位控制一个引脚）**GPIOx\_IDR**读取引脚输入电平（只读）**GPIOx\_ODR**设置/读取输出电平**GPIOx\_BSRR**原子位操作（低 16 位置位，高 16 位清零）**GPIOx\_BRR**位清零寄存器**GPIOx\_PUPDR**配置上拉/下拉（F4/F7/H7 系列）**GPIOx\_OTYPER**配置输出类型：0=推挽，1=开漏

## 五、常用配置速查表

应用场景推荐模式按键检测（接地）上拉输入按键检测（接 VDD）下拉输入LED 驱动推挽输出I2C 通信复用开漏输出 + 外部上拉USART TX复用推挽输出USART RX浮空输入ADC 采样模拟输入未用引脚模拟输入（省电 + 抗干扰）需要 5V 高电平输出开漏输出 + 外部 5V 上拉

## 六、HAL 库配置示例

```c
// 1. 使能 GPIO 时钟
__HAL_RCC_GPIOA_CLK_ENABLE();

// 2. 配置 GPIO
GPIO_InitTypeDef GPIO_InitStruct = {0};
GPIO_InitStruct.Pin = GPIO_PIN_5;
GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;    // 推挽输出
GPIO_InitStruct.Pull = GPIO_NOPULL;
GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

// 3. 控制输出
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);    // 输出高
HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);  // 输出低
HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);                  // 翻转

// 4. 读取输入
GPIO_PinState state = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0);
```

## 总结

GPIO 看似简单，但推挽与开漏的选择、上拉与下拉的理解、复用功能的配置，是通往更复杂外设（I2C、SPI、PWM）的基石。掌握了 GPIO，你就掌握了单片机与物理世界对话的第一门语言。

> *工欲善其事，必先利其器。* —— 《论语》

  
‍