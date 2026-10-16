---
title: '状态机与表驱动详解'
description: ''
pubDate: '2026-10-20 09:00:00'
category: 'embedded'
tags: ['状态机', '表驱动', '嵌入式']
---

## 引言

嵌入式程序和桌面程序最大的区别，不是资源少，而是**永远不退出**。上电之后主循环要跑几天几个月，期间要响应按键、收报文、盯传感器——没有"做完就 return"这回事。把这种"长期醒着、来事了才动"的逻辑写清楚，靠的不是聪明，是纪律。

状态机就是这门纪律。它的全部主张只有一句话：**系统在任一时刻恰好处于一个可命名的状态，外部事件驱动它在状态之间转移**。这一句话能消灭嵌入式代码里最顽固的一类 bug——"标志位排列组合失控"。本文从 UML 记法讲到 switch-case、转移表、函数指针表三种实现，再到事件队列与层次状态机，配一套按键与充电器的实战代码。

## 一、状态机的三要素

状态、事件、转移（带动作）。用 Miro Samek《Practical UML Statecharts in C/C++》里最经典的开场例子——键盘的 CAPS_LOCK 键——看全这三个要素：

![[statemachine-notation.webp|Miro Samek《Practical UML Statecharts in C/C++》Figure 2.2：键盘 CAPS_LOCK 键的状态机——default 与 caps_locked 两个状态，实心圆为初始转移，转移标注「触发 / 动作」，caps_locked 上的自环转移不离开状态]]

小写打字是 `default` 状态，按一下 CAPS_LOCK 转到 `caps_locked`，再按又转回来——每按任意键执行各自的动作（输出小写或大写）。一张图读完，UML 状态图的常用记号也就齐了：

| 记号 | 名字 | 含义 |
|---|---|---|
| 圆角矩形 | 状态 | 系统的一个稳定处境，名字是名词 |
| 实心圆 + 箭头 | 初始转移 | 上电/复位后进入的第一个状态 |
| `触发 [守卫] / 动作` | 转移标注 | 事件到来、条件满足时，做什么、去哪 |
| 指回自己的箭头 | 自转移 | 不离开状态的内部转移，entry/exit 不重跑 |
| 大矩形包小矩形 | 嵌套状态 | 层次状态机（见第六节） |

## 二、状态图不是流程图

两者的箭头长得一模一样，语义完全相反。Samek 用同一行为的两种建模把这个区别画透了：

![[statemachine-vs-flowchart.webp|同书 Figure 2.3：同一个行为的两种建模——(A) 状态机把「等事件」作为一等公民，(B) 流程图把控制流与加工步骤混在一条链里]]

| | 流程图 | 状态机 |
|---|---|---|
| 驱动方式 | 控制流自己往下走 | 被事件推着走，没事件就静止 |
| 空闲时 | 走到终点就结束 | 停在某个状态，无限期等 |
| 循环 | 靠箭头绕回去，画多了像毛线球 | 天生是闭环 |
| 擅长 | 一次做完的数据加工 | 长期运行的响应行为 |
| 典型用途 | 算法、初始化序列 | 按键、协议解析、电源管理 |

嵌入式里大量逻辑是第二类：你不知道下一个事件什么时候来、是什么，只知道来了之后该干什么。硬用流程图的思路写，就会长出满天飞的标志位——那是没有画出来的状态机（第九节专门清算它）。

## 三、基线实现：switch-case

最朴素的状态机不需要任何框架，一个枚举加两层 switch：

```c
typedef enum { ST_IDLE, ST_RUN, ST_PAUSE, ST_FAULT } dev_state_t;
typedef enum { EV_START, EV_STOP, EV_ERROR, EV_ACK } dev_event_t;

static dev_state_t state = ST_IDLE;

void dev_dispatch(dev_event_t ev)
{
    switch (state) {
    case ST_IDLE:
        switch (ev) {
        case EV_START: motor_on();  state = ST_RUN;   break;
        default:                                        break;  // 其余忽略
        }
        break;
    case ST_RUN:
        switch (ev) {
        case EV_STOP:   motor_off(); state = ST_IDLE; break;
        case EV_ERROR:  motor_off(); latch_fault();   state = ST_FAULT; break;
        default:                                        break;
        }
        break;
    /* ST_PAUSE / ST_FAULT 同理 */
    }
}
```

三层结构一眼可读：外层管状态，内层管事件，赋值即转移。状态和事件都不多时，这就是正确答案，别过度设计。痛点在规模：状态数 × 事件数一大，case 嵌套迅速膨胀；新增一个状态要同步改所有内层 switch 的 `default` 分支——漏一处，就是一个只在特定状态下才复现的丢事件 bug。

## 四、表驱动：把转移画进数组

状态机的本质是一张**状态 × 事件 → 下一状态 + 动作**的二维表。既然是表，就放进数组，让数据替代码干活。以一个简化的锂电池充电器为例：

| 当前状态 \ 事件 | 插入电池 | 电压到阈值 | 拔出电池 | 超温 |
|---|---|---|---|---|
| 检测 | → 预充 | — | — | → 故障 |
| 预充 | — | → 快充 | → 检测 | → 故障 |
| 快充 | — | → 已充满 | → 检测 | → 故障 |
| 已充满 | — | — | → 检测 | → 故障 |
| 故障 | — | — | → 检测 | — |

```c
typedef enum { ST_DETECT, ST_PRE, ST_FAST, ST_FULL, ST_FAULT, ST_NUM } chg_state_t;
typedef enum { EV_BAT_IN, EV_V_TH, EV_BAT_OUT, EV_T_NOK, EV_NUM } chg_event_t;

typedef struct {
    chg_state_t next;
    void (*action)(void);       // NULL 表示该格忽略事件
} chg_trans_t;

/* [当前状态][事件] —— 转移全部集中在这一块只读数据里 */
static const chg_trans_t CHG_TABLE[ST_NUM][EV_NUM] = {
    /*                 EV_BAT_IN                  EV_V_TH                 EV_BAT_OUT              EV_T_NOK            */
    /* ST_DETECT  */ {{ST_PRE,  chg_start_pre},  {ST_DETECT, NULL},      {ST_DETECT, NULL},      {ST_FAULT, chg_latch}},
    /* ST_PRE     */ {{ST_PRE,  NULL},           {ST_FAST, chg_start_fast},{ST_DETECT, chg_off}, {ST_FAULT, chg_latch}},
    /* ST_FAST    */ {{ST_FAST, NULL},           {ST_FULL, chg_stop},    {ST_DETECT, chg_off},   {ST_FAULT, chg_latch}},
    /* ST_FULL    */ {{ST_FULL, NULL},           {ST_FULL, NULL},        {ST_DETECT, chg_off},   {ST_FAULT, chg_latch}},
    /* ST_FAULT   */ {{ST_FAULT,NULL},           {ST_FAULT,NULL},        {ST_DETECT, chg_off},   {ST_FAULT,NULL}},
};

static chg_state_t chg_state = ST_DETECT;

void chg_dispatch(chg_event_t ev)
{
    const chg_trans_t *t = &CHG_TABLE[chg_state][ev];
    if (t->action != NULL)
        t->action();              // 先做动作再搬家，顺序全场唯一
    chg_state = t->next;
}
```

收益是结构性的：`chg_dispatch` 永远不用再改，加状态加事件只动表（编译器还会按 `ST_NUM × EV_NUM` 检查初始化完整性）；评审转移逻辑时读的是一块矩形数据，扫一眼就知道「快充态对哪些事件没设防」。

一个实践细节：表里放不下 if-else 的分支（比如"插入的电池电压太低才进预充"）。正路是**把分支挪进事件定义**——采到电池电压后由事件生产侧区分 `EV_BAT_IN_LOW` / `EV_BAT_IN_OK`，表保持纯数据。实在复杂的守卫条件，放进该格的 action 函数里，别让它漏出表外。

## 五、每状态一个函数

状态多了以后，另一种组织方式让每个状态领到一个专属函数，返回下一状态：

```c
typedef chg_state_t (*chg_handler_t)(chg_event_t ev);

static chg_state_t h_detect(chg_event_t ev)
{
    switch (ev) {
    case EV_BAT_IN:  chg_start_pre();  return ST_PRE;
    case EV_T_NOK:   chg_latch();      return ST_FAULT;
    default:                           return ST_DETECT;
    }
}
/* h_pre / h_fast / h_full / h_fault 同理 */

static const chg_handler_t CHG_HANDLERS[ST_NUM] = {
    [ST_DETECT] = h_detect,  [ST_PRE] = h_pre,    [ST_FAST] = h_fast,
    [ST_FULL]   = h_full,    [ST_FAULT] = h_fault,
};

void chg_dispatch(chg_event_t ev)
{
    chg_state = CHG_HANDLERS[chg_state](ev);
}
```

三种实现的取舍：

| 实现方式 | 转移逻辑 | 加一个状态 | 适合 |
|---|---|---|---|
| switch-case | 分散在 case 里 | 改所有内层 switch | 状态 ≤ 4 的小机器 |
| 转移表 | 集中成矩形数据 | 加一行 | 转移规整、动作简单 |
| 函数指针表 | 分散在各状态函数 | 加一个函数+表项 | 单状态逻辑重（带计数、查表） |

判断标准就一条：**改起来要不要同时动多处**。转移表赢在"所有转移一屏可见"，函数表赢在"每个状态的私事自己管"。

## 六、层次状态机：一张图省 N 条边

状态多了会有一个重复模式：好几个状态对同一个事件的反应完全一样（比如充电器里任何状态拔电池都回检测态）。平面状态机只能把这条边复制 N 遍；层次状态机（HSM）允许状态嵌套，让一组状态**共享**一条转移：

![[statemachine-nested-states.webp|同书 Figure 2.5：层次嵌套状态——(A) 嵌套记法：超状态 s1 包住子状态 s11；(B) 烤箱状态机：heating 包住 toasting 与 baking，OPEN_DOOR 一条转移即可从所有子状态退到 door_open]]

右图中 `heating` 是超状态，`toasting` / `baking` 是它的子状态。子状态不认识的事件（比如 `OPEN_DOOR`）会沿着层次**上浮**给超状态处理——一条转移就覆盖了"烤面包时开门"和"烘焙时开门"两种情况，将来再加 `broiling` 子状态也不用回来补边。Samek 把这叫行为继承：超状态的行为所有子状态自动共享。

深水区是进入/退出嵌套状态时的动作次序（从外到内执行 entry、从内到外执行 exit），完整实现就是他那本书后半本的 QP 框架。日常工程里更务实的姿势是：平面状态机 + 默认行兜住公共事件，嵌套留作思维工具——知道"这几个状态其实是一家子"，就不会把同一条转移抄五遍还抄错一处。

## 七、事件队列与 run-to-completion

状态机的半个身子永远在并发里：事件往往来自中断（串口收到一字节、定时器到点、按键扫描），而动作必须在主循环里执行。正确分工会让系统天然免疫一大类竞态：

```c
#define EVQ_DEPTH 16

static chg_event_t evq[EVQ_DEPTH];
static volatile uint8_t evq_head, evq_tail;

/* ISR 里调用：只入队，绝不做动作 */
void chg_post_from_isr(chg_event_t ev)
{
    uint8_t next = (uint8_t)((evq_head + 1) % EVQ_DEPTH);
    if (next != evq_tail) {           // 满了宁可丢，也不阻塞中断
        evq[evq_head] = ev;
        evq_head = next;
    }
}

/* 主循环里调用：出队一个，处理完再取下一个 */
void chg_run(void)
{
    while (evq_tail != evq_head) {
        chg_dispatch(evq[evq_tail]);
        evq_tail = (uint8_t)((evq_tail + 1) % EVQ_DEPTH);
    }
}
```

配套的语义叫 **run-to-completion（RTC）**：一个事件的处理过程不可分割——转移、动作、状态更新一口气做完之前，不开始处理下一个事件。这换来一个便宜而致命的特权：**整个状态机不需要任何锁**。ISR 只碰两个下标和数组（单生产者单消费者，索引各自单写），所有状态变量只在主循环单一上下文里被读写。

反面教材是在中断里直接调 `chg_dispatch()`：动作里那些"启动 PWM、刷显示、走 I2C"的活儿带着中断优先级抢跑，和主循环里的读写搅在一起，偶发错乱而且永远复现不了。队列深度按"最坏情况下一个 RTC 周期里能积压多少事件"取，别拍脑袋——这方面的完整讨论见 [[freertos-queue-notify]]。

## 八、实战：按键消抖与长按

把前几节攒的东西拧在一个真实零件上：机械按键，10 ms 定时器节拍，要求滤除抖动、区分短按与长按（1 s）。这是"小机器用 switch-case + 扩展状态变量"的标准范本：

```c
typedef enum { K_RELEASED, K_DEBOUNCE, K_PRESSED, K_LONG } key_state_t;

static key_state_t k_state = K_RELEASED;
static uint8_t     k_cnt;              // 扩展状态变量：时间在这台机器里只是一个计数

/* 定时器每 10ms 喂一次，pressed 为当前引脚电平采样 */
void key_tick_10ms(uint8_t pressed)
{
    switch (k_state) {
    case K_RELEASED:
        if (pressed) { k_cnt = 0; k_state = K_DEBOUNCE; }
        break;

    case K_DEBOUNCE:                    // 连续 2 拍都按着才算真按下
        if (!pressed) { k_state = K_RELEASED; }             // 抖回去了：当作没发生
        else if (++k_cnt >= 2) { key_post(EV_KEY_DOWN); k_state = K_PRESSED; k_cnt = 0; }
        break;

    case K_PRESSED:
        if (!pressed) { key_post(EV_KEY_UP); k_state = K_RELEASED; }   // 短按：松手才算数
        else if (++k_cnt >= 100) { key_post(EV_KEY_LONG); k_state = K_LONG; }  // 100×10ms=1s
        break;

    case K_LONG:                        // 长按已经上报，等松手回初态
        if (!pressed) { k_state = K_RELEASED; }
        break;
    }
}
```

值得留意两处设计。其一，短按的事件在**松手瞬间**才发出（`EV_KEY_UP`），因为在按下那一刻无法预知用户接下来会短按还是长按——事件发的时机本身就是状态设计的一部分。其二，时间没有为它单开一个状态维度，而是一个普通的计数变量挂在状态旁边：纯状态爆炸时，加一个"扩展状态变量"比加五个状态便宜得多，这正是 Samek 书里"扩展状态机"一节的要义。

同样套路换个皮就是协议解析：`等帧头 → 等长度 → 收数据 → 验校验` 四态循环（详见 [[mcu-communication-protocols]] 的帧接收部分，RS-485/Modbus 的字节流都是这么一层层剥出来的），以及 bootloader 里 `等命令 → 擦除 → 写入 → 校验回读` 的固件更新流程（[[mcu-bootloader-iap]]）。节拍来源用 [[mcu-timer-interrupt]] 里的基本定时器中断即可，别在主循环里数循环次数猜时间。

## 九、反模式：标志位是拍扁的状态机

最后清算本文开头提到的那类代码：

```c
if (!err && started && !paused && mode == 2 && xfer_done) {
    // 这五个布尔量的这个组合，意味着"快充阶段、无故障、数据就绪"
}
```

五个布尔量理论上编码了 32 种组合，其中 28 种是从未被设计过的非法状态——它们只是恰好还没同时发生过。每次加需求就添一个 flag，每个 flag 要在所有历史组合下重新推演一遍；谁也说不清"paused 但 xfer_done"是不是合法，因为它没有名字。

状态机的解法是把这些组合**竖起来给名字**：`mode==2 && started && !paused` 就是 `ST_FASTCHARGE`，一个枚举值，非法组合在类型上就不存在。判断一个模块该不该重构成状态机，有个粗暴的启发式：数一数同时参与逻辑的布尔标志，**三个以上就该画图了**——画在纸上，比画在 if 条件里便宜。

## 踩坑速查

| 症状 | 病根 | 药 |
|---|---|---|
| 状态变量在好几个函数里被赋值 | 状态转移散落各处 | 状态只允许在一个 dispatch 里更新 |
| 加状态要改五个文件 | 转移逻辑分散 | 迁移到转移表或函数指针表 |
| 偶发丢事件 | 中断里直接执行动作 | ISR 只入队，主循环 RTC 消费 |
| 处理事件时逻辑重入错乱 | 没有 RTC 语义 | 事件排队串行处理，禁止递归 dispatch |
| 表越填越大全是 NULL | 状态×事件维度失控 | 默认行兜底 + 把分支挪进事件定义 |
| 机器偶尔卡死在某个状态 | 等外部源的状态没兜底 | 凡等外设/总线的状态都配 TIMEOUT 事件 |
| 队列满后事件神秘消失 | 丢弃策略没被观测 | 满时计数/置错标志，深度按最坏积压取 |

## 总结

状态机不是一种高级技巧，而是嵌入式逻辑的默认形态：长期运行的系统必然处于某个可命名的处境，必然靠事件驱动。实现手段按规模升级——小机器 switch-case，转移规整上二维表，状态私事多就每状态一个函数，事件跨上下文必经队列 + RTC。而最该带走的一条判断是第九节那个：布尔标志三个以上，就该画图了。事件队列在 RTOS 里的完整形态见 [[freertos-queue-notify]]；状态机最肥的应用场景——通信协议解析与固件更新——分别在 [[mcu-communication-protocols]] 和 [[mcu-bootloader-iap]]。

> *标志位是拍扁了的状态机：把几十个状态藏进几个布尔量，再用余生把它们拼回来。* —— Iustitiae
