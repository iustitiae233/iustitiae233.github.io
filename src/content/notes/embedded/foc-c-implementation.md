---
title: 'FOC 磁场定向控制的 C 语言实现'
description: 'FOC 的控制原理与架构、Clarke/Park 正逆变换的数学模型，以及在 STM32G4 上用 C 语言实现的完整源码（含 SVPWM 扇区计算）与波形验证'
pubDate: '2026-08-22 05:21:00'
category: embedded
tags: [FOC, 电机控制, STM32, SVPWM, 坐标变换]
---

**磁场定向控制（FOC）**把三相电机的定子电流从静止的 $abc$ 坐标系，经 Clarke、Park 变换搬到跟着转子一起转的 $dq$ 坐标系上——于是在旋转坐标系里，交流量被"拍平"成两个直流量 $i_d$、$i_q$，用两个 PI 控制器就能分别管住磁链和转矩。这里是它的原理框架、几个关键变换的数学模型，以及一份可以直接编译验证的 C 实现。PWM 侧的原理见 [[mcu-pwm]]，代码里用到的定时器与中断见 [[mcu-timer-interrupt]]；SVPWM 矢量合成的专题展开见 [[svpwm-motor-control]]，无刷电机本体与六步换相的背景见 [[bldc-motor-basics]]，电流环/速度环背后的 PI 控制器数学见 [[pid-basics]]。

## 一、磁场定向控制（FOC）介绍

### 1.1 FOC 控制模型介绍

磁场定向控制（FOC），又称矢量控制，是一种控制方法，用于在多种电机类型（包括感应电机、永磁同步电机 PMSM 和无刷直流 BLDC 电机）的全转矩和转速范围内实现良好的控制能力。如果超出额定转速，则使用配合弱磁的磁场定向控制。

以下模块图显示了一个磁场定向控制架构，包括以下组件：

![[foc-architecture.webp|FOC 完整控制框图：蓝色为控制算法、灰色为物理系统；转速环输出 T_ref 送入电流参考发生器，与反馈的 i_d、i_q 比较后经两个电流 PI 控制器输出 v_d_ref、v_q_ref，再经逆 Park 变换（d,q → α,β）、SVPWM 发生器（输出六路 G_au~G_cl 门极信号）驱动功率逆变器带动 PMSM；相电流经 Park/Clarke 变换（a,b,c → d,q）反馈回电流环]]

*图：FOC 整体架构。控制算法的边界很清晰——**只有两个电流 PI 在 dq 域**，往右全是坐标变换与 PWM 生成，往左是可选的外环（速度环/位置环）。*$v_{DC}$ *被同时送给 SVPWM 发生器与保护逻辑，正是欠压/过流保护要盯着的那一路。*

### 1.2 模型功能

设计磁场定向控制的电机控制工程师执行以下任务：

1. 为电流回路开发具有两个 PI 控制器的控制器架构
2. 为可选的转速外环和位置外环开发 PI 控制器
3. 调节所有 PI 控制器的增益以满足性能要求
4. 设计用于控制 PWM 的空间矢量调制器
5. 如果使用无传感器控制，则设计观测器算法来估计转子位置和速度
6. 设计每安培最大转矩或弱磁控制算法，以生成最佳 `id_ref` 和 `iq_ref`
7. 实现在计算上高效的帕克变换、克拉克变换和帕克逆变换
8. 设计故障检测和保护逻辑
9. 验证和确认控制器在不同工况下的性能
10. 在微控制器或 FPGA 上实现采用定点或浮点的控制器

## 二、FOC 模型的几个重要转换关系

### 2.1 Clarke Transform

Clarke Transform 模块计算 $abc$ 参考系中平衡三相分量的克拉克变换，并输出静止 $\alpha\beta$ 参考系中平衡两相正交分量。该模块也可以计算三相分量 $a$、$b$ 和 $c$ 的克拉克变换，并输出分量 $\alpha$、$\beta$ 和 $0$。对于平衡系统，零分量等于零。使用**输入数**参数以使用两个或三个输入。

使用双输入配置时，该模块接受三相（$abc$）中的两个信号，自动计算第三个信号，并输出 $\alpha\beta$ 参考系中的对应分量。例如，该模块接受 $a$ 和 $b$ 输入值或多路复用输入值 $abc$，其中相位 $a$ 轴与 $\alpha$ 轴对齐。

![[foc-clarke-axes.webp|Clarke 变换的矢量关系图：a、b、c 三相轴互差 120°，其中 a 轴与 α 轴重合，β 轴垂直于 α 轴，b、c 在 β 轴两侧对称分布]]

*图：$abc \to \alpha\beta$ 的几何含义。$a$ 轴与 $\alpha$ 轴重合，$\beta$ 轴与之正交——这就是"静止两相正交坐标系"里"正交"二字的来源（图中 $a$、$c$ 分别与 $\alpha$ 轴成 120°）。*

数学模型如下：

$$
\begin{bmatrix} f_\alpha \\ f_\beta \end{bmatrix}
=
\begin{bmatrix}
1 & 0 \\[4pt]
\dfrac{1}{\sqrt{3}} & \dfrac{2}{\sqrt{3}}
\end{bmatrix}
\begin{bmatrix} f_a \\ f_b \end{bmatrix}
$$

### 2.2 Inverse Clarke Transform

Inverse Clarke Transform 模块计算静止 $\alpha\beta$ 参考系中平衡的两相正交分量的克拉克逆变换，并输出静止 $abc$ 参考系中平衡的三相分量。该模块也可以计算分量 $\alpha$、$\beta$ 和 $0$ 的克拉克逆变换，以输出三相分量 $a$、$b$ 和 $c$。对于平衡系统，零分量等于零。使用**输入数**参数以使用两个或三个输入。

该模块接受 $\alpha$-$\beta$ 轴分量作为输入，并输出对应的三相信号，其中相位 $a$ 轴与 $\alpha$ 轴对齐。

![[foc-alphabeta-frame.webp|静止 αβ 两相正交坐标系的示意图：α 轴水平向右，β 轴竖直向上，两者构成直角]]

*图：静止的 $\alpha\beta$ 坐标系本身——$\alpha$ 轴水平、$\beta$ 轴竖直，是不随转子旋转的"地面参照系"。*

数学模型：

$$
\begin{bmatrix} f_a \\ f_b \\ f_c \end{bmatrix}
=
\begin{bmatrix}
1 & 0 \\[4pt]
-\dfrac{1}{2} & \dfrac{\sqrt{3}}{2} \\[4pt]
-\dfrac{1}{2} & -\dfrac{\sqrt{3}}{2}
\end{bmatrix}
\begin{bmatrix} f_\alpha \\ f_\beta \end{bmatrix}
$$

### 2.3 Park Transform

Park Transform 模块计算静止 $\alpha\beta$ 参考系中两相正交分量（$\alpha$、$\beta$）或多路复用 $\alpha\beta 0$ 分量的帕克变换。该模块接受以下输入：

> 静止参考系中的 $\alpha$-$\beta$ 轴分量或多路复用分量 $\alpha\beta 0$。使用**输入数**参数以使用两个或三个输入。对应变换角度的正弦值和余弦值。

在使用双输入配置时，它会输出旋转 $dq$ 参考系中的正交直轴（$d$）和交轴（$q$）分量。在使用三输入配置时，它输出多路复用分量 $dq0$。对于平衡系统，零分量等于零。

可以配置模块，使 $d$ 轴或 $q$ 轴在时间 $t = 0$ 处与 $\alpha$ 轴对齐。

下列各图显示在以下情形下 $\alpha\beta$ 参考系和旋转 $dq$ 参考系中的 $\alpha$-$\beta$ 轴分量：

![[foc-park-dq-frame.webp|Park 变换的两个坐标系：静止的 α 轴与旋转的 d 轴成 θ 角，q 轴超前 d 轴 90°，转子以角速度 ω 旋转]]

*图：$\alpha\beta$（黄色，静止）与 $dq$（黑色，旋转）两套坐标系的关系。$\theta$ 就是"电角度"——Park 变换的输入之一，也是为什么无传感器 FOC 的难点在于**估准这个角**。*

数学模型：

当 $q$ 轴与 $\alpha$ 轴对齐时：

$$
\begin{bmatrix} f_d \\ f_q \end{bmatrix}
=
\begin{bmatrix}
\sin\theta & -\cos\theta \\
\cos\theta & \sin\theta
\end{bmatrix}
\begin{bmatrix} f_\alpha \\ f_\beta \end{bmatrix}
$$

> 其中：$f_\alpha$ 和 $f_\beta$ 是静止 $\alpha\beta$ 参考系中的两相正交分量。$f_d$ 和 $f_q$ 是旋转 $dq$ 参考系中的直轴和交轴正交分量。

### 2.4 Inverse Park Transform

Inverse Park Transform 模块计算正交直轴（$d$）和正交轴（$q$）分量或旋转 $dq$ 参考系中的多路复用 $dq0$ 分量的帕克逆变换。可以对该模块进行配置，使 $d$ 轴或 $q$ 轴在时间 $t = 0$ 处与 $\alpha$ 轴对齐。

该模块接受以下输入：

> 旋转参考系中的 $d$-$q$ 轴分量或多路复用分量 $dq0$。使用**输入数**参数以使用两个或三个输入。对应变换角度的正弦值和余弦值。

在使用双输入配置时，它输出静止 $\alpha\beta$ 参考系中的两相正交分量。在使用三输入配置时，它输出多路复用分量 $\alpha\beta 0$。对于平衡系统，零分量等于零。

下列各图显示在以下情形下的旋转 $dq$ 参考系和 $\alpha\beta$ 参考系中的 $\alpha$-$\beta$ 轴分量：

当 $d$ 轴与 $\alpha$ 轴对齐时：

$$
\begin{bmatrix} f_\alpha \\ f_\beta \end{bmatrix}
=
\begin{bmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{bmatrix}
\begin{bmatrix} f_d \\ f_q \end{bmatrix}
$$

当 $q$ 轴与 $\alpha$ 轴对齐时：

$$
\begin{bmatrix} f_\alpha \\ f_\beta \end{bmatrix}
=
\begin{bmatrix}
\sin\theta & \cos\theta \\
-\cos\theta & \sin\theta
\end{bmatrix}
\begin{bmatrix} f_d \\ f_q \end{bmatrix}
$$

> 其中：$f_d$ 和 $f_q$ 是旋转 $dq$ 参考系中的直轴和交轴正交分量。$f_\alpha$ 和 $f_\beta$ 是静止 $\alpha\beta$ 参考系中的两相正交分量。

## 三、STM32 模拟实现 FOC

### 3.1 FOC 算法的 C 语言实现

**1）Clarke 变换**

![[foc-code-clarke.webp|编辑器截图：clarkeTransform 函数，31~35 行；注释给出 Iα = Ia、Iβ = (Ia + 2Ib) / sqrt(3)，函数体为 alphaBeta->alpha = abc->Ua 与 alphaBeta->beta = (abc->Ua + 2 * abc->Ub) * SQRT_3]]

**2）Clarke 逆变换**

![[foc-code-inverse-clarke.webp|编辑器截图：inverseClarkeTransform 函数，71~76 行；注释给出 Ua = Uα、Ub = -1/2 * Uα + sqrt(3)/2 * Uβ、Uc = -1/2 * Uα - sqrt(3)/2 * Uβ，函数体用 DIV_1 与 SQRT_3_DIV_2 两个宏实现]]

**3) Park 变换**

![[foc-code-park.webp|编辑器截图：parkTransform 函数，37~50 行；先算 sinAngle、cosAngle，再用 dq->d = cosAngle * alpha + sinAngle * beta、dq->q = -sinAngle * alpha + cosAngle * beta 完成变换]]

**4) park 逆变换**

![[foc-code-inverse-park.webp|编辑器截图：inverseParkTransform 函数，50~64 行；alphaBeta->alpha = d * cosAngle - q * sinAngle、alphaBeta->beta = d * sinAngle + q * cosAngle]]

### 3.2 测试代码实现

> 代码 216 行：设置 d 轴的值为 0.2f
> 代码 217 行：设置 q 轴的值为 0
> 代码 221 行：设置电机 DQ 轴上运行的角度值范围（0~2π）
> 代码 224 行：实现 park 逆变换，将 D、Q 坐标转变至 α、β 坐标系上
> 代码 229 行：将经过逆 park 生成的 ia、ib、ic，生成 svpwm

![[foc-code-test.webp|编辑器截图：foc_test 函数，205~240 行；外层 while(run_cnt--) 跑 10 次，内层 for 让 theta 从 0 递增到 2π、步长 0.275f，循环体内依次调用逆 Park、逆 Clarke 与 SVPWM，最后用 printf 输出 alphaBeta_t.alpha、beta 和 phase_t.Ua、Ub、Uc 五个值]]

*图：测试代码把 $\theta$ 从 $0$ 扫到 $2\pi$，每步算出 $\alpha\beta$ 与三相电压并打印——这是**开环**的变换链路验证，不接电机也不需要 ADC 反馈，光靠串口输出就能画出后面那几张波形图。*

## 四、波形验证

1. **D、Q 坐标系中的值经过逆 park 变换生成的 α、β 坐标系上的波形图**，$\alpha$、$\beta$ 的波形相位相差 90°

![[foc-wave-alpha-beta.webp|示波器截图：两条正弦波形（洋红与绿色）频率相同、相位相差 90°，横轴为时间刻度]]

2. **α、β 坐标系经过逆 Clark 生成的 ia、ib、ic 的波形图**，$ia$、$ib$、$ic$ 三个波形之间相位相差 120°

![[foc-wave-ia-ib-ic.webp|示波器截图：三条正弦波形（蓝、紫、黄）频率相同、彼此相位相差 120°，横轴为时间刻度]]

3. **将 α、β 坐标系和 ia、ib、ic 的波形图放在同一个图像中进行参照**

![[foc-wave-combined.webp|上下两个子图并排的示波器截图：上图为相位相差 90° 的两路 αβ 波形，下图为相位相差 120° 的三路 ia/ib/ic 波形，横轴时间刻度对齐，可直接对照]]

*图：三相波形互差 120°、两相波形互差 90°——这正是逆 Clarke 矩阵里 $-\frac{1}{2}$ 与 $\pm\frac{\sqrt{3}}{2}$ 这几个系数要达到的效果。三个波形在同一时间刻度下对齐，说明整条变换链路没有引入额外相移。*

## 五、源代码文件

创建 `foc.c` 文件，编写如下代码：

```c
/* USER CODE BEGIN Header */
/**
 ******************************************************************************
 * File Name        :  foc_ctrl.h
 * Description      :  foc driver base on stm32f446
 ******************************************************************************
 * @attention
 *
* COPYRIGHT:    Copyright (c) 2024  tangminfei2013@126.com
* DATE:         JUL 05th, 2024
 ******************************************************************************
 */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "foc_ctrl.h"
#define  SQRT_3           1.7320508f
#define  SQRT_3_DIV_2     0.8660254f
#define  DIV_1            0.5f
FOC_T FOC;
/*****************************************************************************
Clarke变换 输入三相电流，输出alpha，bate电流
Iα = Ia
Iβ = (Ia + 2Ib) / sqrt(3)
******************************************************************************/
void clarkeTransform(Phase_T *abc, AlphaBeta_T *alphaBeta)
{
    alphaBeta->alpha = abc->Ua;
    alphaBeta->beta = (abc->Ua + 2 * abc->Ub) * SQRT_3;
}
/****************************************************************************
Park变换，输入电角度、Ialpha和Ibeta，经过Park变换得到Iq、Id
Id = Iα · cosθ + Iβ · sinθ
Iq = Iα · sinθ + Iβ · cosθ
*****************************************************************************/
void parkTransform(const AlphaBeta_T *alphaBeta, float angle, DQ_T *dq)
{
    float sinAngle = sin(angle);
    float cosAngle = cos(angle);
    dq->d = cosAngle * alphaBeta->alpha + sinAngle * alphaBeta->beta;
    dq->q = -sinAngle * alphaBeta->alpha + cosAngle * alphaBeta->beta;
}
/***************************************************************************
park逆变换，输入Uq、Ud得到Ualpha、Ubeta
Uα = Ud · cosθ - Uq · sinθ
Uβ = Ud · sinθ + Uq · cosθ
****************************************************************************/
void inverseParkTransform(DQ_T *dq, AlphaBeta_T *alphaBeta, float angle)
{
    float cosAngle = cos(angle);
    float sinAngle = sin(angle);
    alphaBeta->alpha = dq->d * cosAngle - dq->q * sinAngle;
    alphaBeta->beta = dq->d * sinAngle + dq->q * cosAngle;
}
/**********************************************************************************************************
Clarke逆变换，输入Ualpha、Ubeta，得到Ua,Ub,Uc
Ua = Uα
Ub = -1/2 * Uα + sqrt(3)/2  * Uβ
Ub = -1/2 * Uα - sqrt(3)/2  * Uβ
**********************************************************************************************************/
 void inverseClarkeTransform(AlphaBeta_T *abVoltage, Phase_T *abc)
 {
     abc->Ua = abVoltage->alpha;
     abc->Ub = -DIV_1 * abVoltage->alpha + SQRT_3_DIV_2 * abVoltage->beta;
     abc->Uc = -DIV_1 * abVoltage->alpha - SQRT_3_DIV_2 * abVoltage->beta;
 }
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
void foc_test(void)
{
    int run_cnt = 10;
    float theta = 0;
    float ta,tb,tc;
    DQ_T dq_t;
    AlphaBeta_T alphaBeta_t;
    SVPWM_T svpwm_out;
    Phase_T phase_t;
    dq_t.d = 0.2f;
    dq_t.q = 0.0f;
    while( run_cnt--)
    {
        for ( theta = 0; theta < 6.2831853f; theta += 0.275f )
        {
            // 逆Park变换
            inverseParkTransform(&dq_t,&alphaBeta_t,theta);
            // 逆Clark变换
            inverseClarkeTransform(&alphaBeta_t, &phase_t);
            // swpwm 转换
            SVPWM( &svpwm_out,&phase_t );
            ta = 100.0f*svpwm_out.ta;
            tb = 100.0f*svpwm_out.tb;
            tc = 100.0f*svpwm_out.tc;
           // printf("%.4f,%.4f,%.4f,%.4f,%.4f\n", alphaBeta_t.alpha*100.0f ,
           // alphaBeta_t.beta*100.0f ,ta,tb,tc);
            printf("%.4f,%.4f,%.4f,%.4f,%.4f \n", alphaBeta_t.alpha,alphaBeta_t.beta,
                                                phase_t.Ua,phase_t.Ub,phase_t.Uc );
        }
    }
}
/* End of this file */
```

创建 `foc.h` 文件，编写如下代码：

```c
/* USER CODE BEGIN Header */
/**
 ******************************************************************************
 * File Name        :  foc_ctrl.h
 * Description      :  foc driver base on stm32f446
 ******************************************************************************
 * @attention
 *
* COPYRIGHT:    Copyright (c) 2024  tangminfei2013@126.com
* DATE:         JUL 05th, 2024
 ******************************************************************************
 */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#ifndef __FOC_CTRL_H
#define __FOC_CTRL_H
/*****************************************************************************/
/* Includes                                                                  */
/*****************************************************************************/
#include "main.h"
#include "utils_types.h"
#ifdef _cplusplus
extern "C" {
#endif 
typedef struct 
{
    float Ia;  // Phase A current
    float Ib;  // Phase B current
    float Ic;  // Phase C current
    float Ua;  // Phase A Voltage
    float Ub;  // Phase B Voltage
    float Uc;  // Phase C Voltage
} Phase_T;
typedef struct
 {
    float alpha;  // alpha-axis current
    float beta;   // beta-axis current
} AlphaBeta_T;
typedef struct 
{
    float d;  // d-axis current
    float q;  // q-axis current
} DQ_T;
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
typedef struct
{
    float U_d;
    float U_q;
    float theta;
    float U_alpha;
    float U_bate;
    Phase_T Phase_Curr;
    AlphaBeta_T  AlphaBeta;
    DQ_T DQ;
} FOC_T;
extern FOC_T FOC;
void foc_test(void);
#ifdef _cplusplus
}
#endif   
#endif    /* __FOC_CTRL_H */
```

## 六、几点观察

- **代码与注释不一致**：`clarkeTransform()` 上方的注释写的是 $I_\beta = (I_a + 2I_b)/\sqrt{3}$，函数体却写成了 `(abc->Ua + 2 * abc->Ub) * SQRT_3`——乘 $\sqrt{3}$ 而非除。两者相差 3 倍（$\sqrt{3} \times \sqrt{3}$），若要照抄这段代码，这一行需要按自己的标度约定核对。上面 2.1 节的矩阵是"除"的那个版本。
- **Park/逆 Park 的对齐约定要与系数配套**：本实现取 $d$ 轴与 $\alpha$ 轴对齐（$\theta = 0$ 时 $d = \alpha$、$q = \beta$），与 2.4 节第一组矩阵一致；而 2.3 节给的矩阵是 $q$ 轴与 $\alpha$ 轴对齐的版本。混用两套约定，表现是**电机能转但转矩方向/力矩大小不对**，不是不转——这类错误很难从现象倒推。
- **SVPWM 只算到占空比**：`SVPWM()` 的 `// step4：3路PWM输出` 是空的，`ta/tb/tc` 也只是被 `foc_test()` 打印出来，没有写进 `TIMx->CCR`。要在硬件上跑，最后一步得自己接上定时器——所以本文严格说是**"变换链路的开环验证"**，不是完整的电机驱动器。
- **文件头注释写的是 stm32f446**：文章标题说 STM32G4，源码里的 `Description` 却写着 `foc driver base on stm32f446`。这份代码本身不依赖具体型号（纯浮点数学 + `math.h`），挪到哪个 Cortex-M4 上都能跑，但用 G4 的话可以换成 CORDIC 或 FPU 单精度指令加速。

---

**素材来源**：本文为微信公众号「STM32应用分析」2026-08-22 文章《磁场定向控制 (FOC)模型的C语言实现（STM32G4）》的整理存档，作者 mftang（原发于 CSDN，所有插图带 `CSDN @mftang` 水印）。原文中 5 张纯公式截图已改写为 KaTeX 排版，代码块由插图转写为可复制的文本；其余插图保留原图。原代码 `Copyright (c) 2024 tangminfei2013@126.com`。
