---
title: '电机控制的空间矢量调制 SVPWM'
description: 'SVPWM 的矢量合成原理（基本空间矢量、伏秒平衡、马鞍波）、扇区判断与作用时间计算的 C 语言实现，附 STM32G4 波形验证'
pubDate: '2026-09-02 05:21:00'
category: embedded
tags: [SVPWM, FOC, 电机控制, PWM, STM32]
---

SVPWM 是 FOC 的"最后一公里"——把静止坐标系上的参考电压矢量 $U_{ref}$，变成三相逆变器六个开关管的导通时序。电机本体与六步换相的背景见 [[bldc-motor-basics]]，PWM 基础见 [[mcu-pwm]]；本文的代码与 [[foc-c-implementation]] 是同一份 `foc_ctrl` 工程，Clarke/Park 变换的全文在那边。

## 一、SVPWM 介绍

空间矢量调制（SVPWM）是感应电机和永磁同步电机（PMSM）磁场定向控制的常用方法。空间矢量调制负责生成脉宽调制信号以控制逆变器的开关，由此产生所需的调制电压，以所需的速度或转矩驱动电机。空间矢量调制也称为空间矢量脉宽调制（Space Vector PWM）。

## 二、实现原理

### 2.1 设计要求

考虑三相逆变器电机控制的空间矢量调制，该逆变器具有六个开关，共有**八种有效的开关配置**。每种开关配置都会产生特定的电压施加于电机端子——这些电压是**基本空间矢量**，以空间矢量六边形表示其幅值和方向。

![[svpwm-hexagon.webp|空间矢量六边形：六个基本电压矢量按 60° 均分圆周指向六个顶点，中心是两个零矢量；图中一个 PWM 周期内取相邻的 U3、U4 各作用一段时间、其余时间由零矢量作用，矢量和近似平均参考矢量 Uref]]

通过对开关区间内的基本空间矢量（方向）和零矢量（幅值）作用时间进行调节，可以近似得到空间矢量六边形内**任意位置、任意幅值**的电压矢量。例如图中，一个 PWM 周期内选择两个相邻空间矢量（$U_3$ 和 $U_4$）分别作用一段时间、在周期其余时间内由零矢量（$U_7$ 或 $U_8$）作用，从而得到近似平均参考矢量 $U_{ref}$。

这就是**伏秒平衡**——相邻两个有效矢量 $U_x$、$U_y$ 与零矢量 $U_z$（取 $U_0$ 或 $U_7$）按作用时间加权，合成参考矢量：

$$T_1 \cdot U_x + T_2 \cdot U_y + T_0 \cdot U_z = T_s \cdot U_{ref}$$

$$U_{ref} = \frac{T_1}{T_s} U_x + \frac{T_2}{T_s} U_y + \frac{T_0}{T_s} U_z$$

其中 $T_s$ 为 PWM 周期，$T_1$、$T_2$ 为两个相邻有效矢量的作用时间，$T_0 = T_s - T_1 - T_2$ 为零矢量作用时间。通过控制开关序列——即控制脉冲的导通持续时间——就可以在每个 PWM 周期获得具有变化幅值和方向的任何电压矢量。空间矢量调制方法的目标，就是**在每个 PWM 周期生成与参考电压矢量相符的开关序列，以实现连续旋转的空间矢量**。

### 2.2 SVPWM 的实现

空间矢量调制方法基于参考电压矢量进行操作，在每个 PWM 周期为逆变器生成适当导通信号。采用空间矢量调制的磁场定向控制架构如下：

![[svpwm-foc-architecture.webp|采用 SVPWM 的 FOC 控制架构示意：转速环/电流环输出的参考电压经逆 Park 变换得 Uα、Uβ，送入 SVPWM 模块计算扇区与导通时间，生成三相导通脉冲驱动逆变器，形成连续旋转的电压矢量]]

在每个 PWM 周期，以电压矢量作为输入参考，SVM 算法会：

1. 基于参考电压矢量计算开关导通时间
2. 基于导通时间生成马鞍波
3. 基于导通时间为逆变器开关生成适当的导通脉冲

![[svpwm-saddle-waveform.webp|SVPWM 生成的空间矢量调制电压信号波形：三相调制波呈马鞍形状，基波正弦上叠加了明显的三次谐波分量，三相相位互差 120°]]

所生成的马鞍波能够最大程度地利用直流总线电压——与正弦脉宽调制（SPWM）相比，该方法能提供更好的额定电压输出（通用结论：SVPWM 线性区的最大线电压幅值比 SPWM 高约 15%）。然后，将生成的导通信号应用于三相逆变器的开关，以所需的速度或转矩驱动电机。

## 三、SVPWM 的 C 语言实现

### 3.1 代码结构

原文按其工程文件的行号描述代码结构：

- 代码 84 行：设置 SVPWM 的采样周期
- 代码 85~87 行：设置扇区判断的电压值（$u_1$、$u_2$、$u_3$）
- 代码 91 行：计算扇区
- 代码 97~111 行：实现第 5 扇区的波形
- 代码 116~129 行：实现第 1 扇区的波形
- 代码 130~145 行：实现第 3 扇区的波形
- 代码 147~162 行：实现第 2 扇区的波形
- 代码 165~179 行：实现第 6 扇区的波形
- 代码 181~196 行：实现第 4 扇区的波形

（原文在此配了 5 张代码截图；代码全文已在下面转写为可复制的文本，截图不再收录。）

> [!NOTE]
> 本文源码与 [[foc-c-implementation]] 收录的 `foc_ctrl.c/.h` 是**同一份代码**（同为 mftang 的 foc_ctrl 工程，Clarke/Park 正逆变换的全文与逐行观察在那边）。本页只展开 SVPWM 本体，两个文件的完整清单以 FOC 笔记为准。

SVPWM 用到的数据结构（`SVPWM_T`，摘自 `foc_ctrl.h`）：

```c
typedef struct
{
    int sector;
    float u1;
    float u2;
    float u3;
    float ta;
    float tb;
    float tc;
    float Ts;
    float t0;
    float t1;
    float t2;
    float t3;
    float t4;
    float t5;
    float t6;
    float t7;
} SVPWM_T;
```

### 3.2 SVPWM 函数本体

```c
void SVPWM(SVPWM_T *svpwm, Phase_T *abc)
{
    float sum;
    float k_svpwm;
    // step-1: 设置象限电压值
    svpwm->Ts = 1.0f;        // SVPWM的采样周期
    svpwm->u1 = abc->Ua;
    svpwm->u2 = abc->Ub;
    svpwm->u3 = abc->Uc;
    // step2：扇区判断
    // 根据u1、u2和u3的正负情况确定所处的扇区
    svpwm->sector = (svpwm->u1 > 0.0f) + ((svpwm->u2 > 0.0f) << 1) + ((svpwm->u3 > 0.0f) << 2); // N=4*C+2*B+A
    // step3:计算基本矢量电压作用时间（占空比）
    // 根据扇区的不同，计算对应的t_a、t_b和t_c的值，表示生成的三相电压的时间
    switch (svpwm->sector)
    {
        case 5:
            // 扇区5
            svpwm->t4 = svpwm->u3;
            svpwm->t6 = svpwm->u1;
            sum = svpwm->t4 + svpwm->t6;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum; //
                svpwm->t4 = k_svpwm * svpwm->t4;
                svpwm->t6 = k_svpwm * svpwm->t6;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t4 - svpwm->t6) / 2;
            svpwm->ta = svpwm->t4 + svpwm->t6 + svpwm->t7;
            svpwm->tb = svpwm->t6 + svpwm->t7;
            svpwm->tc = svpwm->t7;
            break;
          case 1:
            // 扇区1
            svpwm->t2 = -svpwm->u3;
            svpwm->t6 = -svpwm->u2;
            sum = svpwm->t2 + svpwm->t6;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum; // 计算缩放系数
                svpwm->t2 = k_svpwm * svpwm->t2;
                svpwm->t6 = k_svpwm * svpwm->t6;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t2 - svpwm->t6) / 2;
            svpwm->ta = svpwm->t6 + svpwm->t7;
            svpwm->tb = svpwm->t2 + svpwm->t6 + svpwm->t7;
            svpwm->tc = svpwm->t7;
            break;
        case 3:
            // 扇区3
            svpwm->t2 = svpwm->u1;
            svpwm->t3 = svpwm->u2;
            sum = svpwm->t2 + svpwm->t3;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum; //
                svpwm->t2 = k_svpwm * svpwm->t2;
                svpwm->t3 = k_svpwm * svpwm->t3;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t2 - svpwm->t3) / 2;
            svpwm->ta = svpwm->t7;
            svpwm->tb = svpwm->t2 + svpwm->t3 + svpwm->t7;
            svpwm->tc = svpwm->t3 + svpwm->t7;
            break;
        case 2:
            // 扇区2
            svpwm->t1 = -svpwm->u1;
            svpwm->t3 = -svpwm->u3;
            sum = svpwm->t1 + svpwm->t3;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum;
                svpwm->t1 = k_svpwm * svpwm->t1;
                svpwm->t3 = k_svpwm * svpwm->t3;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t1 - svpwm->t3) / 2;
            svpwm->ta = svpwm->t7;
            svpwm->tb = svpwm->t3 + svpwm->t7;
            svpwm->tc = svpwm->t1 + svpwm->t3 + svpwm->t7;
            break;
        case 6:
            // 扇区6
            svpwm->t1 = svpwm->u2;
            svpwm->t5 = svpwm->u3;
            sum = svpwm->t1 + svpwm->t5;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum; //
                svpwm->t1 = k_svpwm * svpwm->t1;
                svpwm->t5 = k_svpwm * svpwm->t5;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t1 - svpwm->t5) / 2;
            svpwm->ta = svpwm->t5 + svpwm->t7;
            svpwm->tb = svpwm->t7;
            svpwm->tc = svpwm->t1 + svpwm->t5 + svpwm->t7;
            break;
        case 4:
            // 扇区4
            svpwm->t4 = -svpwm->u2;
            svpwm->t5 = -svpwm->u1;
            sum = svpwm->t4 + svpwm->t5;
            if (sum > svpwm->Ts)
            {
                k_svpwm = svpwm->Ts / sum; //
                svpwm->t4 = k_svpwm * svpwm->t4;
                svpwm->t5 = k_svpwm * svpwm->t5;
            }
            svpwm->t7 = (svpwm->Ts - svpwm->t4 - svpwm->t5) / 2;
            svpwm->ta = svpwm->t4 + svpwm->t5 + svpwm->t7;
            svpwm->tb = svpwm->t7;
            svpwm->tc = svpwm->t5 + svpwm->t7;
            break;
        default:
            break;
    }
    // step4：3路PWM输出
}
```

### 3.3 STM32G4 平台上验证

测试入口是 `foc_test()`（完整源码见 [[foc-c-implementation]]）：给定 $u_d = 0.2$、$u_q = 0$，让电角度 $\theta$ 从 0 扫到 $2\pi$（步进 0.275 rad），每个角度依次做逆 Park 变换、逆 Clarke 变换、SVPWM 转换，把 $\alpha$、$\beta$ 与三相占空比 `ta/tb/tc` 按逗号分隔打印出来。

α、β 坐标系上的波形（正交的两路正弦）：

![[svpwm-alpha-beta-waveform.webp|α-β 坐标系波形：Uα 与 Uβ 是两路相位差 90° 的正弦波，对应幅值恒定、匀速旋转的电压矢量]]

经 SVPWM 转换后的三相波形（马鞍波）：

![[svpwm-svm-output-waveform.webp|经 SVM 转换后的三相波形：ta、tb、tc 三路占空比呈马鞍波形状，中段出现平顶凸起，相位互差 120°]]

## 四、几点观察

- **与 [[foc-c-implementation]] 同一份代码**：本文的 `foc_ctrl.c/.h` 与 FOC 笔记收录的完全同源（两个公众号先后刊发）。Clarke 变换"注释写除 $\sqrt{3}$、代码却乘 $\sqrt{3}$"的矛盾在那边已详述，照抄前先核对。
- **扇区判断是"三值编码"**：`(u1>0) + ((u2>0)<<1) + ((u3>0)<<2)` 把三相电压符号拼成三位二进制数 $N = 4C + 2B + A$，一步得到扇区号，省掉了传统扇区判断的 `arctan` 或 `Uref1/2/3` 三比较法。三相电压互差 120°、任一时刻不会同号，所以 $N = 0$（全负）与 $N = 7$（全正）理论上不可达——`default: break;` 里什么都不做也"安全"。但数值噪声或断相时 $N$ 仍可能落进 0/7，此时 `ta/tb/tc` **保持上一次的旧值**，输出占空比冻结——排查断相/开路故障时记得这一现象。
- **电压直接当时间用，隐含归一化约定**：`t4 = u3; t6 = u1;` 把电压值直接赋给作用时间，成立的前提是输入电压已经归一化到 $[0, 1]$ 占空比域（`foc_test()` 里 `dq.d = 0.2f` 正是归一化值，`Ts = 1.0f`）。若直接喂以伏特为单位的电压（如 12 V），`sum > Ts` 恒成立，每拍都触发饱和缩放，波形整体压扁。
- **零矢量对半分是七段式的关键细节**：`t7 = (Ts - t4 - t6) / 2` 把剩余时间平分给 PWM 周期两端的零矢量，每个有效矢量作用段被零矢量对称包裹（七段式），开关谐波性能优于把零矢量集中放一侧的五段式。
- **`.c` 文件头注释写的是 `foc_ctrl.h`**：原文两个文件的 `File Name` 都是 `foc_ctrl.h`，转写时保留原样。
- **行号对应关系**：「代码 84 行」等行号对应原工程文件；本页代码块是节选，行号不再一一对应。

---

**素材来源**：本文为微信公众号「ZephyrOS嵌入式操作系统」2026-09-02 文章《电机控制的空间矢量调制 (SVPWM)》的整理存档（原代码 `Copyright (c) 2024 tangminfei2013@126.com`，与 [[foc-c-implementation]] 同源）。原文 2 张公式截图改写为 KaTeX、5 张代码截图转写为文本代码块、5 张示意图保留原图（PNG 转无损 WebP，像素零差异）。
