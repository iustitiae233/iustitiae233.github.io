---
title: 'CAN总线详解'
description: ''
pubDate: '2026-10-16 15:00:00'
category: embedded
tags: [CAN, 总线, 通信]
---

## 引言

UART 一对一、I2C/SPI 一个主机带一圈从机——[[mcu-communication-protocols]] 里那三兄弟都撑不起"几十个节点、谁都能发、电机旁边照样通信"这种场面。CAN 用两根差分线做到了：多主竞争有仲裁、错误有隔离、短帧有 CRC，汽车上一辆车几十个 ECU 全挂在这两根线上，工业和电机控制跟着受益。

这页笔记把 CAN 拆成四层讲清楚：电气层（差分与线与）、仲裁层（谁先说话）、报文层（帧里每个字段）、时序层（位怎么采样），最后落到 bxCAN 外设怎么配。

## 一、拓扑与电气：两根线，一个线与

![[can-topology.webp|CAN 网络拓扑（RM0008 Figure 222）：多个节点（应用 MCU + CAN 控制器 + CAN 收发器）共用一对 CAN High / CAN Low 差分总线]]

每个节点三件套：**MCU 里的 CAN 控制器**（bxCAN，管协议）、**收发器**（TJA1050、SN65HVD230 这类，管电平）、**两根总线 CAN_H/CAN_L**。控制器出 TX/RX 逻辑电平，收发器把它翻译成差分摆到总线上。

CAN 没有时钟线、没有主从，靠两个电平约定撑起一切：

| 总线状态 | CAN_H | CAN_L | 差分电压 | 逻辑值 |
| --- | --- | --- | --- | --- |
| **显性**（dominant） | ≈ 3.5 V | ≈ 1.5 V | ≈ 2 V | **0** |
| **隐性**（recessive） | ≈ 2.5 V | ≈ 2.5 V | ≈ 0 V | **1** |

关键在"显性压过隐性"：任何一个节点输出 0，总线就是 0——多个节点同时发送时，总线电平是所有输出的**线与**。这个物理事实是下一节仲裁的全部基础。

差分带来的好处是共模抑制：两根线绞在一起，干扰同时砸在两根上，接收端取差值，共模噪声直接减掉。这也是 CAN 线要**绞接**、且长度能到几十米到一公里的原因（1 Mbps 约 40 m，降速到 40 kbps 约 1 km，信号往返延迟是硬约束）。

手册这张拓扑图没画终端电阻——实物里它必须有：**总线两端各一只 120 Ω** 接在 CAN_H 与 CAN_L 之间，匹配双绞线特性阻抗、吸收反射。两端都接好后，万用表量总线电阻约 60 Ω（两只 120 Ω 并联），这是板子调试前的例行检查。忘接终端，信号振铃，偶发 CRC 错；中间多接一只，电阻更低、显性电平变弱，整网不稳。

## 二、仲裁：ID 小者胜，输了不摔跤

多主意味着撞车：两个节点同时发包怎么办？CAN 的答案优雅到只有一条规则——**发送 1（隐性）的同时回读总线，读到 0（显性）就说明有人抢占了，立刻退出发送、继续听**。

由于线与，ID 数值小的帧必然在某个位上先发出 0，把对方压成"读到 0"。所以：

* **ID 越小优先级越高**（0x001 赢 0x100）
* 仲裁输掉的节点不损毁、不重发垃圾——它自动转为接收，等总线空闲再战，赢了的那帧**无损通过**，这叫非破坏性仲裁
* 工程做法：把电机电流环的报文 ID 排得比诊断报文小，实时性就是仲裁结果

代价是 ID 不能有优先级反转的侥幸：高优先级节点一直发会饿死低优先级——CAN 没有公平调度，优先级设计就是系统设计。

## 三、报文格式：一帧里每个字节都有名有姓

![[can-frames.webp|CAN 帧格式总览（RM0008 Figure 235）：数据帧（标准/扩展 ID）、遥控帧、错误帧、过载帧及帧间空间的位场划分，右侧 Notes 栏解释 SOF/ID/RTR/IDE/DLC/CRC/ACK/EOF 各字段含义]]

以标准数据帧为主干过一遍：

| 字段 | 位数 | 作用 |
| --- | --- | --- |
| **SOF** | 1 | 显性位，硬同步，"我开始说了" |
| **ID** | 11 | 仲裁 + 报文身份（是"什么报文"，不是"发给谁"） |
| **RTR** | 1 | 0=数据帧，1=遥控帧 |
| **IDE** | 1 | 0=标准格式，1=后面还有 18 位 ID |
| **r0/r1** | 1 | 保留，显性 |
| **DLC** | 4 | 数据长度 0–8 字节 |
| **Data** | 0–64 | 有效载荷 |
| **CRC** | 15 | 校验序列 + 1 位界定符 |
| **ACK** | 2 | 发送方发隐性，**任何一个收对了的节点把它改成显性**——没有 ACK 位被拉低，发送方就知道没人听懂 |
| **EOF** | 7 | 全隐性，帧结束 |

四个变体记三点就够：

* **扩展帧**：29 位 ID，仲裁段拆成 11 位基 ID + SRR + IDE + 18 位扩展 ID，前段按标准帧规则仲裁——同 ID 时标准帧赢扩展帧
* **遥控帧**：RTR=1、无数据。"谁有 0x201 的数据，发一份"——接收节点按需广播的机制
* **错误帧**：任何节点检测到错误就发 6 个连续显性位——这故意违反位填充规则，全网立刻知道这帧废了

位填充（bit stuffing）贯穿 SOF 到 CRC：**连续 5 个同电平位后自动插一个反相位**。一是给接收端留足重同步机会（NRZ 编码怕长串不变），二是让错误帧的"6 连显性"成为明确的违法信号。算帧长时别忘了填充位，最高速率下它吃掉约 20% 的标称带宽。

CAN 是广播总线：帧里没有源地址、没有目标地址，**ID 标的是内容而不是收件人**，要不要收由每个节点的过滤器决定——这正好接到第五节。

## 四、位时序：在哪儿采样，差多少能容忍

![[can-bit-timing.webp|CAN 位时序（RM0008 Figure 234）：一个标称位时间分为同步段 SYNC_SEG（1 tq）、位段 1 BS1、位段 2 BS2，采样点位于 BS1 与 BS2 交界，发送点位于位末尾]]

UART 的波特率两头约好就行，CAN 不行——仲裁要求全网节点**在同一个位时间内的同一时刻采样**，时钟误差直接吃掉仲裁和 ACK。每个位被切成三段：

| 段 | 长度 | 作用 |
| --- | --- | --- |
| **SYNC_SEG** | 固定 1 tq | 同步缓冲，预期跳变落在这里 |
| **BS1** | 1–16 tq | 跳变后传播+相位缓存，**采样点在 BS1 结束处** |
| **BS2** | 1–8 tq | 采样后的缓冲，也给重同步留调整空间 |

时间量子 tq = (BRP + 1) × tPCLK，于是波特率 = 1 / [(1 + BS1 + BS2) × tq]。采样点位置 = (1 + BS1) / (1 + BS1 + BS2)，工程惯例放在 **75%–87.5%**——给信号传播和晶振误差留余量。

拿 500 kbps 算一遍（PCLK1 = 36 MHz，[[mcu-rcc]] 的 72/36/72 配方）：

* 位时间 = 2 µs；取 tq = 250 ns → BRP+1 = 9，每位 8 tq
* 切分 1 + 5 + 2：采样点 = 6/8 = **75%** ✓
* 寄存器：`Prescaler=9, TS1=4, TS2=1`（段长减一写进寄存器）

**SJW**（重同步宽度，1–4 tq）是最后一个参数：接收方发现跳变没落在 SYNC_SEG，就把 BS1 拉长或 BS2 缩短最多 SJW 个 tq 追回去。SJW 不能超过 BS1/BS2 的最小值，配 1 个 tq 是常态。

节点间晶振误差的预算大约 ±1.4%（采样点留多远就有多少容忍度），所以 CAN 板老老实实上晶体，别指望 HSI 的 ±1% 裕量够用——温度一漂就贴线。

## 五、bxCAN：邮箱、FIFO、过滤器

F1 的 bxCAN 把协议硬件化，CPU 只碰三样东西：

* **发送**：3 个发送邮箱，装好帧写请求寄存器即可，硬件排队、仲裁、重发全自动
* **接收**：2 条 FIFO、各 3 帧深，收到的帧先落 FIFO；应用层只管取，来一次取一次，取不及硬件兜着
* **过滤**：28 组过滤器（双 CAN 时一分为二），每组可选 32 位掩码/列表或 16 位掩码/列表模式

过滤器是 CAN 驱动的灵魂：总线上跑着几百种 ID，全部进中断 CPU 就废了。**掩码模式**回答"这一类我都要"（ID + mask，mask 的 0 位是无关位）；**列表模式**回答"精确这几个"（每组精确匹配 2 个 32 位 ID）。过滤器命中的帧进 FIFO0 或 FIFO1，映射关系自由安排——比如电机报文进 FIFO0 高优先级中断、诊断报文进 FIFO1 慢慢取。

错误管理也是硬件自治：每个节点维护发送/接收错误计数器（TEC/REC）：

| 状态 | 条件 | 行为 |
| --- | --- | --- |
| Error Active | 计数 < 128 | 正常收发，出错发主动错误帧 |
| Error Passive | TEC 或 REC > 127 | 受限：出错只发被动错误标志，且发完要等 8 个隐性位 |
| **Bus Off** | TEC > 255 | **物理上离线**，控制器不再收发 |

Bus-off 的节点不是坏了，是被隔离了——它干扰总线太多次，被踢出局。恢复条件是检测到 128 次 11 个连续隐性位（软件可发退出恢复模式指令加速）。做产品时**必须监控 bus-off**：接线短路、终端缺失的现场，设备静默的根因十有八九在这。

## 六、HAL 配置示例

500 kbps、FIFO0 收一帧中断通知——最小可用骨架：

```c
CAN_HandleTypeDef hcan;

void CAN_Config(void)
{
    __HAL_RCC_CAN1_CLK_ENABLE();               // 先开钟（时钟树的闸刀）

    hcan.Instance = CAN1;
    hcan.Init.Prescaler           = 9;         // tq = 250 ns @ PCLK1 36 MHz
    hcan.Init.Mode                = CAN_MODE_NORMAL;
    hcan.Init.SyncJumpWidth       = CAN_SJW_1TQ;
    hcan.Init.TimeSeg1            = CAN_BS1_5TQ;   // 1+5+2=8tq → 500 kbps
    hcan.Init.TimeSeg2            = CAN_BS2_2TQ;   // 采样点 75%
    hcan.Init.TimeTriggeredMode   = DISABLE;
    hcan.Init.AutoBusOff          = ENABLE;    // bus-off 后硬件自动恢复
    hcan.Init.AutoWakeUp          = ENABLE;
    hcan.Init.AutoRetransmission  = ENABLE;    // 仲裁输/出错自动重发
    hcan.Init.ReceiveFifoLocked   = DISABLE;   // FIFO 满时新帧覆盖旧帧
    hcan.Init.TransmitFifoPriority= DISABLE;   // 邮箱按 ID 优先级而不是请求顺序
    HAL_CAN_Init(&hcan);

    // 过滤器 0：32 位掩码，只收 ID=0x201 一类（掩码全 1 = 精确匹配）
    CAN_FilterTypeDef f = {0};
    f.FilterBank           = 0;
    f.FilterMode           = CAN_FILTERMODE_IDMASK;
    f.FilterScale          = CAN_FILTERSCALE_32BIT;
    f.FilterIdHigh         = 0x201 << 5;       // 32 位过滤寄存器：STD_ID 在 [31:21]
    f.FilterIdLow          = 0x0000;
    f.FilterMaskIdHigh     = 0x7FF << 5;       // 低 11 位全比对
    f.FilterMaskIdLow      = 0x0000;
    f.FilterFIFOAssignment = CAN_RX_FIFO0;
    f.FilterActivation     = ENABLE;
    HAL_CAN_ConfigFilter(&hcan, &f);

    HAL_CAN_ActivateNotification(&hcan, CAN_IT_RX_FIFO0_MSG_PENDING);
    HAL_CAN_Start(&hcan);
}

// FIFO0 有帧待取 → 回调（在 ISR 上下文，快取快走）
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan_)
{
    CAN_RxHeaderTypeDef hdr;
    uint8_t data[8];
    HAL_CAN_GetRxMessage(hcan_, CAN_RX_FIFO0, &hdr, data);
    // ISR 里别做业务：拷走数据，置信号量/队列，业务在任务里做
    // 中断→任务的交接套路见 freertos-semaphore-callback 一篇
}
```

两个工程习惯：`AutoRetransmission` 保持 ENABLE，失败自动重发是协议承诺的可靠性；发送用 `HAL_CAN_AddTxMessage` 前查 `HAL_CAN_GetTxMailboxesFreeLevel`，三只邮箱都满时等中断别死等轮询。

## 七、常见问题与注意事项

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| 完全无 ACK、发送一直失败 | 总线单节点 / 终端电阻缺失 / 收发器没焊 | 万用表量总线 60 Ω，示波器看 CAN_H/L 摆幅 |
| 偶发 CRC 错误、误帧 | 位时序参数错、节点间晶振偏差大 | 统一 tq 划分，采样点 75–87.5% |
| 只在高负载时丢帧 | FIFO 满溢出 | 中断里快取；过滤器收窄；看 `HAL_CAN_GetRxFifoFillLevel` |
| 能通信但偶尔"卡死"后自愈 | bus-off 自动恢复中 | 监控 ESR，查接线/终端/干扰源 |
| 两节点点对点不通，换板就好 | 一端误配静默/环回模式 | 检查 `CAN_MODE_NORMAL`，别用上次的 LOOPBACK |
| 波特率"差一点"也能通，量产翻车 | 低负载时误差预算没用完 | 按 87.5% 采样点+最坏晶振误差重算预算 |
| 想发 8 字节以上的数据 | 经典 CAN 上限 8 字节 | 拆帧+序号重组，或换 CAN FD（FD 单帧到 64 字节） |

## 总结

CAN 的四层各管一件事：差分电气管活下来，线与仲裁管谁说话，短帧+CRC+ACK 管说得对不对，位时序管全网同拍。bxCAN 把这四层全做成了硬件，软件的工作收敛到三处——位时序参数算对、过滤器划好、中断到任务的数据交接做好。顺 [[mcu-communication-protocols]] 的对比往下走：UART 学的是点对点，I2C/SPI 学的是主从编址，CAN 教的是**没有主、没有地址、只有优先级和内容**的总线世界观——这套世界观在 [[mcu-dma]] 搬运数据、[[freertos-semaphore-callback]] 交接中断的配台下，才是一台能上现场的设备。

> *仲裁不靠谦让，靠把规则写进电平里。* —— Iustitiae
