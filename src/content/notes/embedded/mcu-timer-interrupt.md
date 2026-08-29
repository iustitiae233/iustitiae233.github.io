---
title: '单片机定时器与中断系统详解——从CNT到NVIC'
description: ''
pubDate: '2026-06-27 11:00:00'
category: embedded
---

## 引言

定时器和中断是嵌入式系统的"心跳"与"神经系统"。定时器让单片机感知时间的流逝，中断让单片机能够及时响应外部事件。两者结合，构成了实时嵌入式系统的核心基础。

## 一、核心组件概览

STM32 定时器中断系统由三个核心部件协同工作：

部件作用**定时器 (TIM)**产生定时中断请求**NVIC (嵌套向量中断控制器)**判断优先级并决定是否响应中断**CPU**暂停当前任务，跳转到中断服务函数执行

## 二、定时器核心寄存器

寄存器全称功能**CNT**计数器根据时钟信号递增/递减计数**PSC**预分频器对输入时钟分频，扩展定时范围**ARR**自动重装载寄存器设定计数上限，CNT 达到 ARR 时触发更新事件**DIER**中断使能寄存器控制是否允许定时器事件触发中断**SR**状态寄存器包含 UIF（更新中断标志）等标志位

### 定时计算公式

```c
实际计数频率 CK_CNT = TIMxCLK / (PSC + 1)
中断周期 = (ARR + 1) / CK_CNT
```

> **示例**：APB1 时钟 72MHz，PSC=71，ARR=999  
> → CK\_CNT = 72MHz / 72 = 1MHz  
> → 中断周期 = 1000 / 1MHz = **1ms**

## 三、中断触发完整流程

```c
1. CNT 计数到达 ARR 值
       ↓
2. 硬件自动置位 UIF（更新事件标志）
       ↓
3. 若 UIE（更新中断使能位）已使能
       ↓
4. 定时器向 NVIC 发送中断请求
       ↓
5. NVIC 根据优先级判断是否响应
       ↓ (若响应)
6. CPU 暂停当前任务，保存现场，跳转到中断服务函数
       ↓
7. ISR 中执行业务代码
       ↓
8. 【关键】手动清除 UIF 标志位
```

## 四、NVIC 中断优先级详解

### 抢占优先级 vs 响应优先级

优先级类型作用**抢占优先级**决定中断是否可嵌套。高抢占优先级可以打断低抢占优先级的中断**响应优先级（子优先级）**抢占优先级相同时，若多个中断同时到达，响应优先级高者先处理

### 优先级分组（5 组，4 位分配）

分组抢占优先级位数子优先级位数抢占级数子优先级级数NVIC\_PriorityGroup\_004016NVIC\_PriorityGroup\_11328NVIC\_PriorityGroup\_22244NVIC\_PriorityGroup\_33182NVIC\_PriorityGroup\_440160

> 数值越小，优先级越高。推荐使用 **Group 2**（4 级抢占 + 4 级子优先级），在嵌套能力和响应顺序之间取得平衡。

## 五、完整配置步骤

### 第1步：使能外设时钟

```c
// TIM2 挂载在 APB1 总线上
RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);
```

### 第2步：配置 NVIC 中断优先级

```c
void TIM2_NVIC_Config(void)
{
    NVIC_InitTypeDef NVIC_InitStructure;

    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);

    NVIC_InitStructure.NVIC_IRQChannel = TIM2_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 0;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 3;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);
}
```

### 第3步：初始化定时器时基参数

```c
void TIM2_Config(void)
{
    TIM_TimeBaseInitTypeDef TIM_TimeBaseStructure;

    TIM_TimeBaseStructure.TIM_Period = 999;          // ARR
    TIM_TimeBaseStructure.TIM_Prescaler = 71;        // PSC
    TIM_TimeBaseStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseStructure.TIM_CounterMode = TIM_CounterMode_Up;

    TIM_TimeBaseInit(TIM2, &TIM_TimeBaseStructure);
}
```

### 第4步：使能中断并启动定时器

```c
TIM_ClearFlag(TIM2, TIM_FLAG_Update);           // 清除标志位
TIM_ITConfig(TIM2, TIM_IT_Update, ENABLE);       // 使能更新中断
TIM_Cmd(TIM2, ENABLE);                           // 启动定时器
```

### 第5步：编写中断服务函数

```c
void TIM2_IRQHandler(void)
{
    if (TIM_GetITStatus(TIM2, TIM_IT_Update) == SET)
    {
        TIM_ClearITPendingBit(TIM2, TIM_IT_Update);  // 必须清除标志位！

        // 用户逻辑
        LED_TOGGLE();
    }
}
```

## 六、注意事项

注意事项说明**必须手动清除中断标志**不调用 `TIM_ClearITPendingBit()` 会导致反复进入中断，程序卡死**中断函数名要正确**必须与启动文件中定义的中断向量名称一致**ISR 内代码尽量简短**复杂逻辑应设置标志位，在主循环中处理**初始化时清除标志位**在 `TIM_ITConfig` 之前调用 `TIM_ClearFlag` 防止误触发**确认时钟总线**TIM1/TIM8 挂 APB2，TIM2~TIM7 挂 APB1

## 七、STM32 定时器分类

类型定时器功能**高级控制定时器**TIM1、TIM83 对 PWM 互补输出，常用于三相电机驱动**通用定时器**TIM2~TIM5定时、PWM 输出、输入捕获、编码器接口**基本定时器**TIM6、TIM7仅定时功能，无外部 IO

## 总结

定时器与中断是嵌入式系统的脉搏。理解了 CNT 如何计数、ARR 如何设定周期、NVIC 如何仲裁优先级，你就掌握了实时系统最核心的"时间感"。配合下一篇文章的**输出比较与输入捕获**，定时器的威力才能真正发挥。

> *时间不在于你拥有多少，而在于你怎样使用。* —— 艾克

  
‍