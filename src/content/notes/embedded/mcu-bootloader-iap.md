---
title: 'Bootloader 与 IAP 详解'
description: ''
pubDate: '2026-10-18 09:00:00'
category: embedded
tags: [IAP, Bootloader, Flash]
---

## 引言

产品封进外壳、发到客户手里之后，SWD 线就再也够不着了。固件有 bug 要修、功能要加，唯一的入口是设备自己：上电最先跑的那段小程序。这就是 Bootloader。它决定这次开机是正常进应用，还是停下来等一条串口送来的新固件，把升级在芯片内部完成（IAP，In-Application Programming）。

这页笔记按启动流程顺下来：上电后芯片先跑谁 → Flash 分区怎么摆 → 跳转到应用的六个步骤 → Flash 编程的解锁与半字编程 → 固件接收的可靠性设计。分区表、双区备份、OTA 这些升级架构话题在 [[flash-partition-ota]]，这里不重复。

## 一、上电到 main 之间：谁先执行

复位释放后，Cortex-M3 内核只做两件事：从 0x00000000 读一个数装进 MSP（栈顶指针），再从 0x00000004 读一个数当 PC 跳过去。所以向量表的第一项存放的不是中断向量，而是初始栈顶指针，这就是"向量表[0] = SP"的由来。而 0x00000000 处实际映射到哪块存储器，由 BOOT 引脚决定：

| BOOT1(PB2) | BOOT0 | 启动区域 | 映射到 0x00000000 的存储器 |
| --- | --- | --- | --- |
| × | 0 | 主 Flash | 0x08000000 |
| 0 | 1 | 系统 ROM | 0x1FFFF000（ST 出厂固化的烧录 bootloader） |
| 1 | 1 | SRAM | 0x20000000（调试用） |

两个工程细节：BOOT 引脚在复位后**第 4 个 SYSCLK 上升沿**采样锁存，从 Standby 醒来会重新采样，所以 BOOT0 必须有确定电平（典型 10 kΩ 下拉），悬空的板子会随机从 ROM 启动，症状是"偶尔开机没反应"。BOOT0=1 走的系统 ROM 是 ST 出厂固化的串口/USB 烧录程序，常见型号支持 USART1 与 USB DFU，各型号对照表见 AN2606。它就是"串口一键下载"的原理，但只能整片重烧，做不了现场增量升级，所以正式产品要自己的 IAP；产线的首次烧录与编号流程见 [[product-numbering-flashing]]。

由此可以确定 IAP 的立足点：把 Bootloader 链接在 0x08000000，上电就先执行它。

## 二、Flash 分区：两个程序共用一片 Flash

![[iap-flash-memory-map.webp|AN4657 Figure 1：Flash 存储器映射——最底部（start address，0x08000000）是 IAP 的向量表与 IAP 代码，向上越过 APPLICATION_ADDRESS 分界后是用户应用的向量表与应用代码，顶端为 end address]]

图里是 ST 官方 AN4657 的经典布局：IAP 占 Flash 底部，它的向量表恰好落在 0x08000000，被 BOOT0=0 的默认配置先执行；应用从 APPLICATION_ADDRESS 开始，自带一份完整的向量表。以一个数字例子说明（F103C8，64K Flash、1K 一页）：

| 区域 | 起始 | 大小 | 说明 |
| --- | --- | --- | --- |
| Bootloader | 0x08000000 | 8K（8 页） | 串口接收 + Flash 编程 + 跳转，足够 |
| 应用 | 0x08002000 | 56K | 链接基址改到这里 |
| 参数区（可选） | 0x0800F800 | 1K | 版本号、CRC、配置 |

应用侧要配套两件事：工程的链接基址改到 APPLICATION_ADDRESS（MDK 的 IROM1、GCC 的 ld、STM32CubeIDE 的偏移设置，指的是同一处）；启动后**第一件事把向量表挪过来**，即 `SCB->VTOR = APPLICATION_ADDRESS`（标准库改 system_stm32f10x.c 的 VECT_TAB_OFFSET）。否则中断一来，内核还按 0x00000000 找向量，会跑进 bootloader 的中断服务程序。

## 三、跳转：六个步骤，少一步都是 HardFault

Bootloader 干完活（或无事可干）要跳进应用。跳转就是把内核状态恢复到 Reset_Handler 入口的样子，相当于手工执行一次复位。六个步骤：

```c
#define APP_ADDR 0x08002000U

typedef void (*pFunc)(void);

void jump_to_app(void)
{
    uint32_t sp    = *(volatile uint32_t *)APP_ADDR;        // 向量表[0]：初始栈顶
    uint32_t reset = *(volatile uint32_t *)(APP_ADDR + 4);  // 向量表[1]：Reset_Handler

    // 检查栈顶：不在 SRAM 范围，说明应用区为空或损坏，不跳转
    if ((sp & 0x2FFE0000U) != 0x20000000U) return;

    __disable_irq();                    // 1. 关中断
    HAL_RCC_DeInit();                   // 2. 时钟恢复复位态，PLL 停
    HAL_DeInit();                       //    外设寄存器回默认值
    SysTick->CTRL = 0;                  //    SysTick 必须手动清零，HAL_DeInit 不管它
    for (int i = 0; i < 8; i++) {       // 3. NVIC 关使能 + 清挂起
        NVIC->ICER[i] = 0xFFFFFFFFU;
        NVIC->ICPR[i] = 0xFFFFFFFFU;
    }
    SCB->VTOR = APP_ADDR;               // 4. 向量表指向应用
    __set_MSP(sp);                      // 5. 栈切到应用的
    ((pFunc)reset)();                   // 6. 跳转，不返回
}
```

每一步都对应一种真实的错误：不设 MSP，应用一压栈就写进 bootloader 的旧栈区，很快被应用数据覆盖；挂起中断没清，应用开中断的瞬间就会有一个 UART 中断按新 VTOR 进入尚未初始化的 ISR；SysTick 没停，则会在 1 ms 后把 tick 中断打到已经废弃的向量表上。另外还有两条约束：跳转不是函数调用，栈已经换掉，没有返回路径；bootloader 里不要启动 FreeRTOS、不要开 IWDG，因为调度器停不干净，看门狗一旦打开也没有关停指令（[[mcu-watchdog-lowpower]]），跳过去就是无限复位循环。

应用那边的对称要求：VTOR 设好之前，任何中断都不应该发生。标准启动文件天然满足，不要在时钟没重配、VTOR 没设之前就开外设中断。

## 四、Flash 编程：解锁与半字编程

F1 的 Flash 由 FPEC 管理，动手前先解锁：向 KEYR 依次写 KEY1=0x45670123、KEY2=0xCDEF89AB（PM0075）。顺序错或数值错，硬件立刻置错误位并锁死到下次复位。这相当于给 Flash 写操作加了一道保险丝，防止跑飞的程序误写 Flash。四条规则（全部出自 PM0075）：

* **半字编程**：一次编程 16 位。PG 位置 1 后对目标地址做半字写；数据不是半字或地址不对齐，会产生总线错误
* **只能 1→0**：把 1 写成 0 可以直接写，把 0 改回 1 必须先擦除（擦完全 0xFFFF）
* **HSI 必须开着**：擦写的时序钟来自内部 8 MHz RC，主时钟树跑到 72 MHz PLL 也不影响它（时钟树配置见 [[mcu-rcc]]）。bootloader 里关掉 HSI 的情况实际存在
* **擦除单位是页**：中小容量 1K/页、大容量 2K/页；全片擦（MER）不动信息块

寄存器级需要三组函数：解锁、擦页、写半字，同时把错误位读干净：

```c
void flash_unlock(void)
{
    if (FLASH->CR & FLASH_CR_LOCK) {
        FLASH->KEYR = 0x45670123U;      // KEY1，顺序不能反
        FLASH->KEYR = 0xCDEF89ABU;      // KEY2
    }
}

void flash_erase_page(uint32_t page_addr)
{
    while (FLASH->SR & FLASH_SR_BSY) {} // 空闲才能下命令
    FLASH->CR |= FLASH_CR_PER;          // 页擦除模式
    FLASH->AR  = page_addr;             // 页内任一地址，硬件取页基址
    FLASH->CR |= FLASH_CR_STRT;         // 启动擦除
    while (FLASH->SR & FLASH_SR_BSY) {}
    FLASH->SR |= FLASH_SR_EOP;          // 写 1 清标志
}

int flash_write_halfword(uint32_t addr, uint16_t data)
{
    while (FLASH->SR & FLASH_SR_BSY) {}
    FLASH->CR |= FLASH_CR_PG;
    *(volatile uint16_t *)addr = data;  // 半字写，地址必须 2 字节对齐
    while (FLASH->SR & FLASH_SR_BSY) {}
    if (FLASH->SR & (FLASH_SR_PGERR | FLASH_SR_WRPRTERR)) {
        FLASH->SR |= FLASH_SR_PGERR | FLASH_SR_WRPRTERR;    // 写 1 清错误
        return -1;                      // 多半是写了没擦干净的位置
    }
    FLASH->SR |= FLASH_SR_EOP;
    return 0;
}
```

擦写期间有一个容易忽略的阻塞：CPU 不能从 Flash 取指，而擦一页是毫秒到几十毫秒级，跑在 Flash 里的代码会整体停摆等 BSY。要在这段时间里喂看门狗、判超时，就把那几个函数搬进 RAM 执行；不搬就接受停顿，把看门狗的周期算宽裕。

## 五、固件接收：流程与可靠性

![[iap-flowchart.webp|AN4657 Figure 2：IAP 完整流程——上电检查按键：未按住直接跳转用户程序；按住则初始化 IAP 进入主菜单，可选传输/接收二进制文件或切换写保护，接收的固件数据逐块写入 Flash，写入失败显示错误信息后回到菜单]]

AN4657 的流程图是所有自研 IAP 的基本流程：上电检查按键，没按住就直接跳应用（绝大多数开机的路径，零等待），按住就进菜单收固件。这比"上电先等三秒看看要不要升级"的方案体验好得多。工程上再补充三点：

* **怎么进升级模式**：除了按键，常用"应用里收到升级命令 → 写备份寄存器标志 → NVIC_SystemReset() → bootloader 查到标志直接进菜单"。备份寄存器复位不丢，远程升级全靠这条
* **先校验后擦写**：固件先收进 RAM 或下载区，过完 CRC32/签名校验再擦写应用区。顺序反过来，就是擦了旧固件、新固件又是坏的，设备无法恢复。资源够就上双区轮换（[[flash-partition-ota]] 的 A/B 分区），资源紧就"下载区 + 搬运"
* **传输协议**：UART 上跑 Ymodem-1K 是事实标准，SD 卡/USB 升级同理，都是先完整落盘、再校验、最后擦写；串口帧完整性靠奇偶校验 + 协议层 CRC 双保险（[[mcu-communication-protocols]]）

上电侧最后一道检查在跳转代码里已经有了：栈顶合法性检查（`(sp & 0x2FFE0000) == 0x20000000`，AN2557 的经典判据）。应用区被擦空后是 0xFFFF…，这个检查不通过，bootloader 就留在升级菜单等新固件，不会跳进空区域。

## 六、常见问题与注意事项

| 症状 | 根因 | 解法 |
| --- | --- | --- |
| 跳转即 HardFault | VTOR/MSP 没设、应用链接基址错 | 按六个步骤逐条核对，查链接脚本 ORIGIN |
| 跳转后偶发进入未初始化的中断 | NVIC 挂起位没清 | ICER/ICPR 全写 1 |
| 跳转后串口乱码 | bootloader 留下的波特率/引脚状态 | HAL_DeInit 后应用重配 |
| 升级后无限复位 | bootloader 开了 IWDG，应用没喂 | bootloader 不开看门狗 |
| 写 Flash 总线错误 | 未解锁 / 非半字 / 写了未擦处 | 先解锁 + 半字编程 + 先擦后写 |
| 擦写时系统停顿 | 代码在 Flash 里执行，取指被阻塞 | 关键函数放 RAM，或放宽看门狗周期 |
| 偶发开机没反应 | BOOT0 悬空，随机从 ROM 启动 | 10 kΩ 下拉固定 |
| 跳进空应用区 | 没做栈顶合法性检查 | AN2557 判据挡住 |

## 总结

一条完整的链：BOOT 引脚在第 4 个时钟沿决定 0x00000000 映射到哪块存储器；IAP 占住 Flash 底部，上电先执行；应用自带向量表，启动时把 VTOR 指向应用区；跳转分六步，依次关中断、复位时钟与外设、清 NVIC、设 VTOR、换栈、跳转；FPEC 解锁后按半字编程，擦写期间代码不能从 Flash 取指；固件先校验后擦写，校验不通过就留在菜单等下一份。
