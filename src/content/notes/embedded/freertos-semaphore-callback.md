---
title: 'FreeRTOS信号量与回调函数——任务间的对话'
description: ''
pubDate: '2026-06-27 17:00:00'
category: embedded
---

## 引言

多任务操作系统中，任务不是孤岛——它们需要通信、需要同步、需要共享资源。如果说上一篇的"任务管理"让每个任务独立运行，那么本文的"信号量"就是任务之间对话的语言。

## 一、信号量（Semaphore）—— 四种类型

### 1.1 二值信号量（Binary Semaphore）—— 任务同步 / 中断通知

最常用的信号量类型，只有 0 和 1 两个状态，用于任务间同步或中断通知任务。

**创建：**

```c
SemaphoreHandle_t xSemaphore = xSemaphoreCreateBinary();
// 注意：创建后初始值为 0（空）！
```

**任务中等待（Take）：**

```c
if (xSemaphoreTake(xSemaphore, portMAX_DELAY) == pdTRUE) {
    // 获取到信号量，执行同步操作
}
```

**中断中释放（GiveFromISR）：**

```c
BaseType_t xHigherPriorityTaskWoken = pdFALSE;
xSemaphoreGiveFromISR(xSemaphore, &xHigherPriorityTaskWoken);
portYIELD_FROM_ISR(xHigherPriorityTaskWoken);  // 判断是否需要任务切换
```

**典型应用场景：**  
- 按键中断通知任务处理  
- DMA 传输完成中断通知任务  
- 两个任务之间的握手同步

### 1.2 计数信号量（Counting Semaphore）—— 资源池管理

可以管理多个同类资源，计数值表示可用资源的数量。

```c
// 最大计数 5，初始计数 3（有 3 个资源可用）
SemaphoreHandle_t xCountSem = xSemaphoreCreateCounting(5, 3);

// 消耗一个资源
xSemaphoreTake(xCountSem, portMAX_DELAY);

// 归还一个资源
xSemaphoreGive(xCountSem);
```

**典型应用场景：**  
- 管理固定大小的缓冲区池  
- 限制同时访问某资源的任务数量  
- 多生产者-多消费者模型

### 1.3 互斥锁（Mutex）—— 资源独占 + 优先级继承

用于保护共享资源（全局变量、外设、通信总线），确保同一时刻只有一个任务访问。

```c
// 创建互斥锁
SemaphoreHandle_t xMutex = xSemaphoreCreateMutex();

// 使用模式（必须在同一任务中 Take 和 Give）
xSemaphoreTake(xMutex, portMAX_DELAY);
    // 访问共享资源（printf、I2C、SPI、全局变量）
    // ...
xSemaphoreGive(xMutex);
```

> ⚠️ **关键限制**：  
> - 互斥锁**不能在中断中使用**！  
> - Take 和 Give **必须在同一个任务中成对出现**  
> - 互斥锁自动支持**优先级继承**，防止优先级翻转问题

**优先级翻转问题**：低优先级任务持有锁 → 高优先级任务等待锁 → 中优先级任务抢走 CPU。互斥锁的优先级继承机制会将持有锁的低优先级任务临时提升，避免这种情况。

### 1.4 递归互斥锁（Recursive Mutex）

普通互斥锁同一任务只能 Take 一次，递归互斥锁允许同一任务多次 Take。

```c
SemaphoreHandle_t xRecursiveMutex = xSemaphoreCreateRecursiveMutex();

xSemaphoreTakeRecursive(xRecursiveMutex, portMAX_DELAY);  // 第一次获取
    xSemaphoreTakeRecursive(xRecursiveMutex, portMAX_DELAY);  // 再次获取（OK！）
    xSemaphoreGiveRecursive(xRecursiveMutex);                  // 释放一层
xSemaphoreGiveRecursive(xRecursiveMutex);                      // 完全释放
```

**典型应用场景**：嵌套函数调用中，每个函数都可能需要获取同一个锁。

## 二、信号量类型对比总结

| 类型 | Take 次数 | Give 次数 | 中断可用 | 优先级继承 | 典型用途 |
| --- | --- | --- | --- | --- | --- |
| 二值信号量 | 1 次（变 0） | 1 次（变 1） | ✅ Give | ❌ | 任务同步、中断通知 |
| 计数信号量 | N 次（减到 0） | N 次（加到最大） | ✅ Give | ❌ | 资源池管理 |
| 互斥锁 | 1 次 | 1 次（同一任务） | ❌ | ✅ | 资源独占保护 |
| 递归互斥锁 | 多次（同任务） | 对应次数 | ❌ | ✅ | 嵌套函数锁 |

## 三、软件定时器与回调函数

FreeRTOS 提供**软件定时器**，允许在定时器到期时执行回调函数。这些回调函数在**定时器服务任务**的上下文中运行。

### 创建软件定时器

```c
// 定时器回调函数（不能有死循环！不能有阻塞调用！）
void TimerCallback(TimerHandle_t xTimer) {
    // 定时执行的代码
    // 只能调用带 FromISR 后缀或不阻塞的 API
}

// 创建定时器
TimerHandle_t xTimer = xTimerCreate(
    "MyTimer",                      // 名称
    pdMS_TO_TICKS(100),             // 周期 100ms
    pdTRUE,                         // pdTRUE=周期模式, pdFALSE=单次触发
    (void *)0,                      // 定时器 ID（可传参）
    TimerCallback                   // 回调函数
);

// 启动定时器
xTimerStart(xTimer, 0);
```

### CubeMX CMSIS-RTOS 封装方式

```c
osTimerDef(MyTimer, TimerCallback);
osTimerId timerHandle = osTimerCreate(osTimer(MyTimer), osTimerPeriodic, NULL);
osTimerStart(timerHandle, 5);  // 5ms 周期
```

### 回调函数注意事项

| 注意点 | 说明 |
| --- | --- |
| 不能有死循环 | 回调函数必须快速返回 |
| 不能阻塞 | 不能调用 `vTaskDelay`、`xSemaphoreTake`（带超时的也不行） |
| 不能调用非 FromISR 的 API | 可以使用 `xSemaphoreGiveFromISR` |
| 运行在定时器服务任务中 | 优先级通常较高，耗时操作会影响所有定时器 |

## 四、任务通知 —— 更轻量的替代方案

如果只需要简单的任务同步，**任务通知（Task Notification）** 比信号量更快，占用 RAM 更少——但一个任务只能阻塞在一个通知上。

```c
// 发送通知（任务中）
xTaskNotifyGive(TaskHandle);

// 发送通知（中断中）
vTaskNotifyGiveFromISR(TaskHandle, &xHigherPriorityTaskWoken);

// 等待通知
ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
// pdTRUE  → 收到通知后将值清零（类似二值信号量）
// pdFALSE → 收到通知后将值减 1（类似计数信号量）
```

**任务通知 vs 信号量**：  
- 任务通知：更快、RAM 更少，但**一个任务只能等待一个通知源**  
- 信号量：稍慢但更灵活，可以等待**任意多个信号量**

## 五、信号量 vs 队列 vs 任务通知

| 机制 | 用途 | 传递数据 | 中断安全 | 优先级继承 |
| --- | --- | --- | --- | --- |
| 队列 | 任务间数据传输 | ✅ 数据 | ✅ | ❌ |
| 二值信号量 | 任务同步/中断通知 | ❌ 仅通知 | ✅ | ❌ |
| 计数信号量 | 资源计数管理 | ❌ 计数 | ✅ | ❌ |
| 互斥锁 | 资源独占保护 | ❌ 锁 | ❌ | ✅ |
| 任务通知 | 轻量同步 | 可选 32位值 | ✅ | ❌ |

## 六、关键避坑指南

1. **中断中不能用互斥锁**，只能用信号量（带 `FromISR` 后缀的 API）
2. **中断释放信号量后必须调用** `portYIELD_FROM_ISR()` 检查是否需要上下文切换
3. **互斥锁的 Take 和 Give 必须在同一个任务中成对出现**
4. **二值信号量创建后初始为空（0）**，如需初始可用需额外调用一次 `xSemaphoreGive()`
5. **软件定时器回调中不能阻塞或死循环**
6. **共享资源必须加锁**，否则会出现数据覆盖、串口乱码、I2C/SPI 时序错乱

## 总结

信号量是 FreeRTOS 任务间通信的基石。二值信号量实现同步，计数信号量管理资源，互斥锁保护临界区，软件定时器回调处理周期任务——这四把武器掌握好了，绝大部分 RTOS 应用场景都能从容应对。

> *交流创造秩序，共享需要规则。* —— Iustitiae

  
‍