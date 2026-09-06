# AI 焊点检测仪实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 硬件项目：每个 Milestone 以「验收标准」为完成定义，验收不通过不进入下一个。Steps 使用 checkbox（`- [ ]`）跟踪。

**Goal:** 做一台双模式 AI 焊点缺陷检测仪：脱机时自带屏幕与端侧模型独立检测（快筛）；联机时经 USB 变成「智能相机」，由 PC 端 YOLOv8 复判，并形成「采集 → 标注 → 训练 → 量化 → OTA 下发」的数据闭环。

**Architecture:** ESP32-S3（DVP 摄像头 + SPI 屏 + LVGL + esp-dl 端侧推理）为设备核心；PC 上位机（Python：pyserial + ultralytics）承担重模型推理与训练；两端以 USB CDC 自定义帧协议通信；模型迭代走「PC 训练 → int8 量化 → 下发 flash 模型分区 → OTA 热更新」。

**Tech Stack:** ESP-IDF 5.x + esp_lvgl_port + esp32-camera + esp-dl（esp-ppq 量化）、TinyUSB CDC、RMT(WS2812)；PC 端 Python 3.11+、ultralytics YOLOv8、pyserial、LabelImg/Roboflow 标注。

**Spec:** 无独立 spec——本项目为独立硬件仓库（建议仓库名 `solder-ai-inspector`），本文档即设计与计划合一。学习笔记按站内约定沉淀到 `src/content/notes/embedded/`。

---

## 1. 产品定义

**检测对象**：手工焊/返修焊点的常见缺陷——虚焊（冷焊）、连锡（桥接）、少锡、多锡（锡珠）、偏移、焊洞。首版聚焦 0603/0805 及直插器件焊点（微距可覆盖）；BGA/0201 留作后续换显微镜头的扩展。

**双模式逻辑**（这是产品立足点，UI 必须明示）：

| 模式 | 触发 | 模型 | 定位 |
|---|---|---|---|
| 脱机快筛 | 设备独立使用 | YOLOv8n-int8 @128×128，~0.3-0.5s/帧 | 产线/桌面日常快筛，容忍精度损失 |
| 联机复判 | USB 连 PC | YOLOv8s @PC 端，全分辨率 | 疑难复判 + 数据采集 + 模型再训练 |

**数据闭环**：联机模式既是检测工具也是采集工具——每次拍照原图落盘 PC，积累后标注、训练，新模型量化后 OTA 推回设备。模型越用越准。

## 2. 硬件设计

### 2.1 BOM（参考价，2026-09 淘宝水平）

| 件 | 型号/规格 | 数量 | 参考价 | 备注 |
|---|---|---|---|---|
| 主控板 | ESP32-S3-DevKitC-1 **N16R8** | 1 | ¥45 | 认准 N16R8：8MB Octal PSRAM 是取景+推理双缓冲的刚需；**N8R2 不买** |
| 相机 | OV2640 DVP 模块（带转接板） | 1 | ¥20 | 自带 JPEG 压缩输出，省 CPU |
| 屏 | 2.8" SPI ILI9341 240×320 | 1 | ¥25 | 资料最多；**不买 RGB 并口屏成品板**（16 根数据线与相机打架） |
| 光源 | WS2812B 环形灯环 16 珠 | 1 | ¥8 | 单 GPIO，亮度色温可调 |
| 漫射罩 | 乳白亚克力圆片 | 1 | ¥5 | 焊锡镜面反光的命门，必须漫射 |
| 按键 | 6×6 轻触开关 | 1 | ¥0.5 | 第二按键；第一快门直接复用板上 BOOT 键 |
| 结构 | 3D 打印支架（相机+光源同轴架） | 1 | ¥15 | 固定工作距离 60-80mm |
| 洞洞板/排座/线材 | — | 若干 | ¥15 | |
| **合计** | | | **≈¥135** | SD 卡模块可选（+¥8，脱机存图用） |

### 2.2 引脚分配表

禁忌脚核对：GPIO 19/20（USB OTG 专用）、26-32（模组内 SPI flash）、35/36/37（Octal PSRAM 专用）、0/3/45/46（strapping，除 GPIO0 复用 BOOT 键外不接外设）、43/44（UART0 console 保留）。

相机引脚照抄 esp32-camera 官方 ESP32-S3 例程默认分配（勿自行发明）：

| 外设 | 信号 | GPIO |
|---|---|---|
| OV2640 | Y2-Y9（数据） | 11, 9, 8, 10, 12, 18, 17, 16 |
| OV2640 | VSYNC / HREF / PCLK | 6 / 7 / 13 |
| OV2640 | XCLK（20MHz 输出） | 15 |
| OV2640 | SCCB SDA/SCL（I2C） | 4 / 5 |
| ILI9341 | SCLK / MOSI | 40 / 41 |
| ILI9341 | CS / DC / RST | 42 / 38 / 39 |
| ILI9341 | 背光（LEDC PWM） | 21 |
| WS2812 灯环 | DATA（RMT） | 48 |
| 快门键 | BOOT 键复用 | 0 |
| 功能键 K1 | 轻触开关→GND | 14 |
| **预留空闲** | | 1, 2, 47 |

预算：已用 23 脚，空闲 3 脚 + console。焊线前用上表在 DevKitC-1 丝印上逐一核对。

### 2.3 FreeRTOS 任务规划（双核分工）

| 任务 | 核 | 优先级 | 职责 |
|---|---|---|---|
| `ui_task` | 0 | 4 | LVGL 主循环（esp_lvgl_port 内建） |
| `cam_task` | 1 | 5 | `esp_camera_fb_get` → 按模式分发（取景刷新/拍照存档/送推理） |
| `infer_task` | 1 | 3 | esp-dl 推理（独占核 1 时间片，低于 cam_task 保证取景不卡） |
| `usb_task` | 0 | 4 | TinyUSB CDC 收发（帧协议解析、JPEG 上行） |

任务间通信：消息队列（拍照请求/结果）+ 互斥量（fb 归还）。对应笔记：`freertos-config-tasks`、`freertos-semaphore-callback`。

## 3. 软件设计

### 3.1 固件模块划分（ESP-IDF 组件）

```
components/
  app_ui/        LVGL 界面：取景页/结果页/统计页/设置页
  app_cam/       esp32-camera 封装：初始化、fb 生命周期、取景节流
  app_light/     WS2812 (RMT)：亮度/色温设置，报警闪烁
  app_infer/     esp-dl 推理：模型加载（分区读出）、前处理、后处理、坐标映射
  app_link/      USB CDC 帧协议：组包/拆包/CRC，命令分发
main/            任务创建、模式状态机（idle/viewfinder/capture/infer/link）
```

**模式状态机**：`VIEWFINDER →（快门）→ CAPTURE → INFER(或 LINK 上行) → RESULT → VIEWFINDER`。RESULT 页显示原图缩略 + 缺陷框叠加 + 分类计数；不良时 WS2812 闪红。

**LVGL 页面**（暗色科技风，与博客审美一致）：取景页（全屏 canvas + 十字对位线 + 光源快捷滑条）、结果页、统计页（今日检测数/不良率/缺陷类别柱状图 chart）、设置页（WiFi/亮度/阈值/版本与模型信息）。

### 3.2 USB 帧协议（CDC，双向同格式）

```
| magic: 0xA5 0x55 (2B) | cmd (1B) | len (2B, LE) | payload (len B) | crc16 (2B) |
```

| cmd | 方向 | 含义 |
|---|---|---|
| 0x01 CAPTURE | PC→设备 | 触发拍照 |
| 0x02 LIGHT | PC→设备 | 设光源（亮度/色温） |
| 0x03 MODE | PC→设备 | 切脱机/联机 |
| 0x10 IMG | 设备→PC | JPEG 帧（分片，payload 带序号） |
| 0x11 RESULT | 设备→PC | 端侧检测结果（类别/置信度/框） |
| 0x12 STATUS | 设备→PC | 心跳/模式/版本/模型指纹 |
| 0x20 MODEL | PC→设备 | 模型下发（M6，分区写） |

USB FS 12Mbps，100KB JPEG 上行 <0.1s，满足。CRC16-CCITT，错包丢弃重传由上层超时重发 CAPTURE 兜底。

### 3.3 模型 pipeline

```
采集（联机模式原图落盘 PC）
  → 标注（LabelImg/Roboflow，YOLO 格式）
  → 训练（PC：yolov8n.pt 起步，数据够了再上 s）
  → 导出 ONNX → esp-ppq int8 量化（校准集 100 张）
  → 设备 flash「model」分区（自定义分区表，参照 flash-partition-ota 笔记）
  → 下次启动 esp-dl 加载；OTA 路径 = MODEL 命令流式写分区 + 校验 + 重启
```

冷启动数据：先用北大 PCB 缺陷数据集（6 类裸板缺陷，公开带标注）把 M4/M5 全链路跑通，再换自建焊点数据集。

## 4. Milestones

### M0 环境与点灯（0.5 天）

- [ ] ESP-IDF 5.x + VS Code 扩展装好，`idf.py build` 官方 hello_world 通过
- [ ] LVGL hello world 上 ILI9341（esp_lvgl_port）
- [ ] TinyUSB CDC 枚举，PC 见到串口，echo 回环
- [ ] 仓库初始化（`solder-ai-inspector`），固件骨架 + 组件空目录

**验收**：屏显示 LVGL label；`ls /dev/tty*`（或设备管理器）见 USB 串口；发送任意字节原样返回。

### M1 取景器（1-2 天）

- [ ] esp32-camera 驱动 OV2640（引脚按 §2.2，JPEG 模式，帧大小自适应到 240×320 视野）
- [ ] LVGL canvas 显示实时取景（RGB565 直填或 JPEG 解码，先求通再求快）
- [ ] BOOT 键 = 快门：冻结当前帧 + 显示 JPEG 字节数
- [ ] WS2812 常亮白光（暂固定亮度）

**验收**：取景 ≥10fps 无撕裂；按键后画面冻结、显示 `[123456 B]` 字样。

### M2 光学台（1 天，可并行）

- [ ] RMT 驱动 WS2812 环，LVGL 设置页亮度/色温滑条
- [ ] 3D 打印支架：相机-光源-载物台同轴，工作距离 60-80mm，漫射罩安装
- [ ] 对 0603 焊点实拍，调光到无镜面过曝

**验收**：同一焊点在亮度滑条 20%/60%/100% 下均无高光溢出裁切（直方图或目视），对焦清晰可辨焊点轮廓。

### M3 联机模式（1-2 天）

- [ ] `app_link` 帧协议实现（组包/CRC/分发）
- [ ] PC 上位机 v0：pyserial 收 IMG 存盘 + 发 CAPTURE/LIGHT；界面先用终端 + 文件夹，UI 后置
- [ ] 联机时设备 RESULT 页显示 PC 回传的检测结果占位（先回「OK」）

**验收**：PC 连发 10 次 CAPTURE，收到 10 张可打开的 JPEG，无错包（CRC 计数为 0）。

### M4 数据集与 PC 检测（1 周，主要是攒数据）

- [ ] 北大数据集导入，YOLOv8n 训练跑通全链路（作为 pipeline 验证）
- [ ] 自建采集：≥500 张焊点原图（覆盖 5 类缺陷 + 良品），≥300 张完成标注
- [ ] 上位机 v1：收图 → YOLOv8 推理 → 标注图回传设备显示 + 本地存档

**验收**：自建测试集 mAP@50 ≥ 0.7（不足则继续采数，不进 M5）；设备屏显示 PC 端标注框。

### M5 端侧部署（1 周，技术攻坚）

- [ ] ONNX 导出 + esp-ppq int8 量化（校准集），产出模型文件与元数据（输入尺寸/类别/锚框）
- [ ] `app_infer`：模型分区加载 → 前处理（缩放/归一化）→ esp-dl 推理 → 后处理（NMS/坐标反映射）
- [ ] RESULT 页叠加缺陷框 + 类别 + 置信度；不良触发 WS2812 红闪
- [ ] 精度对比实验记录：端侧 vs PC 端在同一测试集上的混淆矩阵（写进笔记）

**验收**：脱机快门 → 1.5s 内出结果页（推理 ≤0.6s）；良品焊点误报率目测可接受；若 esp-dl 算子不支持 YOLOv8 头，降级 FOMO（只报质心+类别）并在笔记记录取舍。

### M6 模型 OTA 闭环（1-2 天）

- [ ] 自定义分区表：`model` 分区 + 双备份（参照 flash-partition-ota 笔记的回滚思路）
- [ ] MODEL 命令流式写分区 + CRC 校验 + 重启生效；模型指纹入 STATUS
- [ ] 上位机一键「训练 → 量化 → 下发 → 验证」

**验收**：改模型（哪怕只改阈值）下发后，设备重启加载新指纹并显示；下发中断电后旧模型仍可启动（回滚）。

### M7 收尾（可选）

- [ ] 外壳完整化、统计页 chart、SD 卡脱机存图
- [ ] 项目总结笔记进博客（`notes/embedded/`：esp-dl 部署、esp32-camera 踩坑、帧协议设计）

## 5. 风险与备选

| 风险 | 概率 | 备选 |
|---|---|---|
| esp-dl 对 YOLOv8 头算子不全 | 中 | 改 FOMO（Edge Impulse 一键导 esp-idf）；或 YOLOv5-fastest 老图 |
| 端侧 128×128 对小焊点漏检 | 中 | 光学放大（加镜头）、联机模式兜底——双模式本来就是答案 |
| OV2640 微距画质不足 | 低 | 换 OV5640 + M12 微距镜头；或 USB 显微镜拆镜头 |
| 自建数据集不够 | 高 | 公开数据集练手 + 增广（亮度/旋转）；本项目最大工作量就是数据，心理预期 500 张起步 |
| WS2812 广谱白光显色偏差 | 低 | 换 PWM 白光 LED + MOS 管（引脚预算足够） |

## 6. 与博客知识体系的衔接

本项目直接消费既有笔记：`freertos-config-tasks`（§3.1 任务表）、`freertos-semaphore-callback`（fb 互斥）、`mcu-pwm`（背光/光源）、`mcu-communication-protocols`（帧协议设计）、`flash-partition-ota`（模型分区与 OTA）、`mosfet-basics`（光源驱动备选）。

新笔记规划（M 完成后沉淀）：`esp32-camera-dvp`、`esp-dl-quantization`、`usb-cdc-protocol`、`lvgl-esp32-port`。
