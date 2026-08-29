---
title: 'flash分区表，中断向量偏移量和ota升级流程'
description: ''
pubDate: '2026-07-03 16:54:47'
category: embedded
---

## **一、Flash 分区表 —— 给你的 Flash “划地盘”**

### **1. 为什么要分区？**

就像硬盘分 C 盘、D 盘，Flash 也得划出不同的功能区，**让升级过程中新固件的下载、校验、搬移都不会破坏当前正在运行的程序**。

### **2. 一个最典型的 STM32F4 分区设计（1MB Flash）**

假设芯片 Flash 总大小 1MB，起始地址 `0x08000000`。

**分区名起始地址大小作用Bootloader**`0x08000000`64KB上电第一行代码，负责验签、搬运固件、跳转**App 主区**`0x08010000`448KB当前运行的应用程序 (APP)**下载暂存区**`0x08080000`448KB接收 OTA 新固件，差分还原也在这里**参数区**`0x080F0000`64KB存升级状态、版本号、断点续传偏移量等

> 如果你做 **A/B 面升级**（更稳），那就不要暂存区，而是两个同样大小的 App 分区：`APP_A (0x08010000)` 和 `APP_B (0x08060000)`，互相切换。  
> 上面的例子是 **暂存区+还原** 方案，适合差分升级，ROM 刚好够用。

### **3. 分区表如何落地到代码里？**

**① 头文件中用宏定义地址和大小**（bootloader、app 代码共用）

c

```c
// flash_partition.h
#define FLASH_BASE            0x08000000UL
#define BOOTLOADER_SIZE       0x10000   // 64KB
#define APP_SIZE              0x70000   // 448KB
#define DOWNLOAD_SIZE         0x70000
#define PARAM_SIZE            0x10000

#define BOOTLOADER_START      FLASH_BASE
#define APP_START             (FLASH_BASE + BOOTLOADER_SIZE)          // 0x08010000
#define DOWNLOAD_START        (APP_START + APP_SIZE)                  // 0x08080000
#define PARAM_START           (DOWNLOAD_START + DOWNLOAD_SIZE)        // 0x080F0000
```

**② 链接脚本 .ld 文件里限制代码存放范围**  
APP 的链接脚本必须告诉编译器：**代码只能放在** `APP_START` **开始的区域**。

ld

```c
/* STM32F407VG_APP.ld */
MEMORY
{
  FLASH (rx) : ORIGIN = 0x08010000, LENGTH = 448K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}
```

这样生成出来的 `app.bin`，最开头的中断向量表就天然在 `0x08010000`。

---

## **二、中断向量偏移量 —— 让 CPU 找到“对的菜单”**

### **1. 为什么要设偏移量？**

CPU 响应中断时，会到一个固定的寄存器 `SCB->VTOR` 指明的地址去找**中断服务函数入口表**。

* 芯片刚上电，`VTOR` 默认指向 `0x00000000`（映射到 `0x08000000`），那里是 **Bootloader** 的向量表。
* 一旦我们要执行 APP，CPU 必须去 `0x08010000` 找 **APP 自己的向量表**，否则中断一来，设备就死机或乱跳。

这就是“中断向量表重映射”：**把 VTOR 的值从 Bootloader 的地址改成 APP 的地址**。

### **2. 配置位置：链接脚本 + 代码配合**

**第一步：链接脚本定义 APP 的基地址**

上面 `.ld` 文件已经指定了 `FLASH` 起始地址 `0x08010000`，编译出来的第一个 32 位数（初始 SP）和第二个 32 位数（Reset\_Handler）就在这个地址。**向量表位置已经定了。**

**第二步：代码里设置 VTOR 寄存器**

必须在 APP 运行的第一时间设置，通常放在 `system_stm32f4xx.c` 里的 `SystemInit()`，或者在 `main()` 最开头手动加。

**找到/修改** `system_stm32f4xx.c` **中的宏：**

c

```c
#define VECT_TAB_OFFSET  0x10000   /* 偏移 = APP_START - FLASH_BASE */
```

这个宏会在 `SystemInit` 里被写到 `SCB->VTOR`：

c

```c
SCB->VTOR = FLASH_BASE | VECT_TAB_OFFSET;
```

等效于 `SCB->VTOR = 0x08000000 | 0x10000; // 0x08010000`

**对于 Keil 环境：** 在 Target Options → Target → IROM1 里设好 `0x08010000`，再在代码里加 `SCB->VTOR = 0x08010000;`。

**第三步：Bootloader 跳转前要不要设？**

通常 **Bootloader 只需要校验 APP，然后跳转**，跳转前可以把 `SCB->VTOR` 设为 APP 的地址，但 APP 启动后仍会自己再设一次（安全起见）。所以 **APP 自己必须设**。

跳转的典型代码（Bootloader）：

c

```c
void jump_to_app(uint32_t app_addr) {
    uint32_t app_sp = *(volatile uint32_t*)app_addr;
    uint32_t app_reset_handler = *(volatile uint32_t*)(app_addr + 4);

    // 设置栈顶指针
    __set_MSP(app_sp);
    // 可选：将 VTOR 指向 APP 向量表
    SCB->VTOR = app_addr;
    // 跳转到 APP 的复位处理函数
    ((void(*)())app_reset_handler)();
}
```

> 注意：跳转前必须关中断、恢复时钟等，具体看正点原子等例程。

---

## **三、OTA 升级架构（含差分、断点）—— 从头到尾跑一遍**

把上面“分区表 + 向量偏移”套进一个完整的静默升级流程里，你就能看到它们是如何联动工作的。

### **设备正常运行时（APP 运行）**

* APP 的向量表在 `0x08010000`，VTOR 已经设好。
* 后台线程检测到服务器有更新，获取 **差分包** 的 URL、大小、签名。

### **静默下载阶段（APP 仍在前台工作）**

1. APP 通过 HTTP Range 请求，从 0 开始下载差分包，**边下载边写入下载暂存区**（`0x08080000`）。
2. 每写 1KB 或一个扇区，就把 **已接收长度** 记录到参数区（掉电续传用）。
3. 如果下载中断重启，APP 会先读参数区，知道从哪个偏移量继续请求，实现断电续传。
4. 全部下载完毕后，对整个差分包做 **SHA256**，再用预置公钥验签。通过后，在参数区写 **“升级包就绪”标志**，并注明是差分包。

### **触发升级（策略点）**

* 设备夜间重启，或用户关机后上电。
* 芯片先跑 **Bootloader**（`0x08000000`）。

### **Bootloader 阶段 —— 核心处理**

1. **读取参数区**，发现有升级就绪标志。
2. **安全验证**：再次校验下载区差分包签名，确保不是伪造（防止参数区被篡改）。
3. **差分还原**（如果包是差分类型）：

   * Bootloader 读取当前 APP 区固件（`0x08010000`）作为旧版本。
   * 将差分包+旧固件通过差分算法还原成完整新固件，**输出到下载暂存区自身，或是另一个临时缓冲**（此处需要 RAM/Flash 空间规划，例如把暂存区后半部分当输出，小心覆盖）。
   * 还原完成后，新固件就放在下载暂存区（或指定地址）。
4. **搬移/切换固件**：

   * **方案A（暂存区覆盖）**：把下载暂存区的新固件按扇区擦写，拷贝到 APP 主区（`0x08010000`）。此时 APP 区被覆盖，这就是 **OTA 最关键的“覆写”**。
   * **方案B（A/B分区）**：假设有 APP\_B 区（`0x08060000`），直接把新固件还原/解压到 APP\_B，然后修改启动参数指向 B 区。
5. **验签新固件**（安全启动链）：对新写入的 APP 区做完整镜像签名校验，以防搬运过程中出错。
6. **清除升级标志**，设置启动标志（如果 A/B）或保持默认。
7. **设置 VTOR =** `APP_START`，跳转执行新 APP。

### **新 APP 启动**

* 执行 `SystemInit`，`SCB->VTOR` 再次被设为 `0x08010000`。
* 程序正常运行，联网上报“升级成功”。

**整个过程中，分区表提供了地址，中断向量偏移保证了 APP 的中断正常响应，OTA 机制通过暂存区和标志位安全地替换了固件。**