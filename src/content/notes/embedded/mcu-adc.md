---
title: 'ADC模数转换详解——从模拟信号到数字世界'
description: ''
pubDate: '2026-06-27 14:00:00'
category: embedded
---

## 引言

现实世界是模拟的——温度、湿度、压力、光线、声音，都是连续变化的物理量。而单片机只认识 0 和 1。ADC（模数转换器）就是连接这两个世界的桥梁。

## 一、ADC 基本概念

ADC（Analog to Digital Converter）将连续的模拟信号转换为离散的数字信号。转换过程包含四个核心步骤：

步骤说明**采样（Sampling）**以固定时间间隔获取模拟信号的瞬时值**保持（Hold）**用电容保持采样值，防止转换期间信号变化**量化（Quantization）**将连续的模拟值划分为离散的数字级别**编码（Encoding）**将量化结果以二进制形式输出

## 二、核心参数详解

### 1. 分辨率（Resolution）

* STM32 F1/F4 系列：典型 **12 位**分辨率，输出范围 0 ~ 4095（2¹² - 1）
* STM32 H7 系列：最高 **16 位**分辨率，过采样可达 26 位

**LSB（最低有效位）计算公式：**

```c
LSB = Vref+ / 2^分辨率位数
```

以 12 位分辨率、参考电压 3.3V 为例：

```c
LSB = 3.3V / 4096 ≈ 0.806mV
实际电压 = ADC转换值 × (3.3 / 4096)
```

### 2. 采样率（Sampling Rate）

关键参数F1 系列典型值说明ADC 时钟最高14 MHz超过会降低精度常用分频配置PCLK2 的 8 分频 = 9 MHzADCCLK 必须 ≤ 14MHz最短采样周期1.5 个 ADCCLK 周期可编程范围：1.5 ~ 239.5 周期

**总转换时间公式：**

```c
Tconv = 采样时间 + 12.5 个周期（逐次逼近固定时间）
```

> 最快转换时间（F1）：Tconv = (1.5 + 12.5) × (1/12MHz) ≈ **1.17 μs**

### 3. ADC 类型

STM32 采用**逐次逼近型（SAR）ADC**，在精度和速度之间取得良好平衡。

## 三、工作模式

### 转换模式

模式说明**单次转换**触发一次，执行一次转换后停止**连续转换**一次触发后，不断循环转换**扫描模式**按预设顺序轮流采集多个通道**间断模式**分组间断地进行多通道转换

### 通道组

通道组通道数特点**规则通道组（Regular）**最多 16 路正常运行，结果存于单个数据寄存器**注入通道组（Injected）**最多 4 路类似中断，可打断规则通道转换

### 触发方式

* **软件触发**：代码直接启动转换
* **外部事件触发**：定时器、EXTI 外部中断等

## 四、HAL 库配置示例

### 单通道单次转换

```c
// 1. 使能时钟
__HAL_RCC_ADC1_CLK_ENABLE();
__HAL_RCC_GPIOA_CLK_ENABLE();

// 2. GPIO 配置为模拟输入
GPIO_InitTypeDef GPIO_InitStruct = {0};
GPIO_InitStruct.Pin = GPIO_PIN_1;
GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

// 3. ADC 初始化
ADC_HandleTypeDef hadc1;
hadc1.Instance = ADC1;
hadc1.Init.ScanConvMode = ADC_SCAN_DISABLE;
hadc1.Init.ContinuousConvMode = DISABLE;
hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
hadc1.Init.NbrOfConversion = 1;
HAL_ADC_Init(&hadc1);

// 4. 配置通道
ADC_ChannelConfTypeDef sConfig = {0};
sConfig.Channel = ADC_CHANNEL_1;
sConfig.SamplingTime = ADC_SAMPLETIME_1CYCLE_5;
HAL_ADC_ConfigChannel(&hadc1, &sConfig);

// 5. 读取转换值
HAL_ADC_Start(&hadc1);
HAL_ADC_PollForConversion(&hadc1, 10);
uint16_t adc_value = HAL_ADC_GetValue(&hadc1);
float voltage = adc_value * (3.3f / 4096);
```

## 五、DMA 模式 —— 多通道/高速采集

对于多通道或高速持续采集，推荐使用 **DMA 循环传输模式**，由 DMA 自动将 ADC 数据搬移到内存数组，无需 CPU 频繁干预：

```c
// DMA 关键配置
DMA_InitStructure.DMA_Mode = DMA_Mode_Circular;              // 循环模式
DMA_InitStructure.DMA_PeripheralBaseAddr = ADC1_DR_Address;  // ADC数据寄存器
DMA_InitStructure.DMA_MemoryBaseAddr = (uint32_t)&adc_buffer; // 内存数组
DMA_InitStructure.DMA_BufferSize = 通道数量;
```

这样 ADC 持续采集，DMA 自动搬运，CPU 只需在需要时读取 `adc_buffer` 即可。

## 六、常见问题与注意事项

问题原因解决方案**外部阻抗过大导致误差**分压电阻过大（MΩ 级），与内部 50kΩ 阻抗分压使用 ≤10kΩ 分压电阻，或加运放做阻抗变换**多通道串扰**采样电容在通道切换时残留电荷增大通道间采样延时**引脚浮空**外部无输入时引脚悬空加下拉电阻**扫描模式数据覆盖**规则组只有一个数据寄存器及时读取或使用 DMA**ADC 时钟超频**ADC 时钟 >14MHz正确配置分频因子

## 七、STM32 各系列 ADC 参数速查

指标STM32F1STM32F4STM32H7分辨率12 bit12 bit16 bitADC 时钟最高14 MHz36 MHz36 MHz最快转换时间≈ 1 μs≈ 0.5 μs更快参考电压3.3V3.3V2.5V / 3.3VLSB（12bit@3.3V）0.806 mV0.806 mV约 0.05 mV

## 总结

ADC 是单片机感知模拟世界的窗口。从 12 位到 16 位，从单次采样到 DMA 循环采集，理解分辨率、采样率与转换时间的关系，是设计可靠采样系统的基础。

> *世界是连续的，但理解世界的每一步，都是离散的。* —— Iustitiae

  
‍