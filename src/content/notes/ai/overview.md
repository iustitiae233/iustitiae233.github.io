---
title: 'AI 笔记总览——从神经元到多模态的学习地图'
description: 'AI 原理笔记的入口地图：神经网络基础（神经元/损失优化/反向传播/训练稳定性）、语言模型（分词嵌入/注意力/Transformer/训练管线/推理/缩放定律）与视觉模型（CNN/ViT/扩散/多模态）三组共 14 篇，用双向链接串成一张可漫游的网'
pubDate: '2026-09-16 17:00:00'
category: ai
tags: [总览, MOC, AI]
---

AI 原理系列的**总览（MOC，Map of Content）**——按"基础 → 语言 → 视觉"三组组织，每篇的反向链接都会指回这里。

这套笔记的写法有个前提需要说明：**它们是从"参考资料"的定位整理的，不是教程。** 目标是把每个概念讲到"能对上论文里的说法"为止，所以公式、口径、年份都尽量落到实处；代价是读起来密度偏高，不适合当睡前读物。

## 一、神经网络基础——所有模型的共同地基

无论语言模型还是视觉模型，底层都是同一套东西：**会加权求和的单元、衡量错误程度的损失、算梯度的反向传播，以及让深层网络能训起来的各种稳定化手段。**

- [[neuron-and-activation]]——加权求和 + 非线性，以及万能逼近定理究竟承诺了什么
- [[loss-and-optimization]]——MSE/MAE/交叉熵的分工，从 SGD 到 AdamW 的六十年
- [[backpropagation]]——链式法则如何变成一台可工业化的求导机器
- [[training-stability-and-regularization]]——梯度消失、BatchNorm、残差连接，以及防止"背答案"的六种手段

> 这四篇的阅读顺序就是上面的顺序。**第 4 篇里的残差连接是整站唯一一次详解**——后面的 Transformer、ViT、扩散模型遇到它一律指回这里。

## 二、语言模型——从一段文本到一个会对话的模型

- [[tokenization-and-embedding]]——文本变成数字的三道工序（切 token、查表、补位置）
- [[self-attention]]——$\mathrm{softmax}(QK^{\top}/\sqrt{d_k})V$、多头，以及 $O(n^2)$ 与 Flash Attention
- [[transformer-architecture]]——一个层的内部构造、FFN 的知识存储角色、Pre-Norm 之争
- [[llm-training-pipeline]]——预训练灌知识、SFT 教格式、RLHF 对齐偏好
- [[llm-inference-and-decoding]]——自回归、四个解码参数、KV Cache 与量化
- [[scaling-laws]]——Chinchilla 纠正了什么，涌现能力的现象与争议

> **第 6 篇（自注意力）是整站唯一一次注意力机制详解**，其余笔记遇到它都会链过来。

## 三、视觉模型——从识别到生成再到理解

- [[cnn-basics]]——卷积、池化、全连接，架构十年演进与检测/分割的任务谱系
- [[vit]]——把 patch 当 token，以及为什么"数据够多时归纳偏置反而是负担"
- [[diffusion-models]]——前向加噪与反向去噪的不对称设计、潜空间扩散、ControlNet
- [[multimodal-models]]——视觉编码器怎么接进 LLM、CLIP 的对齐空间、世界模型

## 阅读顺序建议

**想尽快理解"ChatGPT 是怎么来的"**：直接从第二组读起——[[tokenization-and-embedding]] → [[self-attention]] → [[transformer-architecture]] → [[llm-training-pipeline]]。这条线是最短路径，第一组只在需要时回查。

**想系统打地基**：按组顺序读，第一组四篇不要跳。[[backpropagation]] 里那个只有两个参数的手算例子值得亲手推一遍，之后所有"梯度"的说法都会变得具体。

**对视觉感兴趣**：[[cnn-basics]] → [[vit]] → [[diffusion-models]] → [[multimodal-models]]。这条线的叙事很完整——CNN 立起"局部性"的假设，ViT 把它推翻，扩散模型换了一个完全不同的生成范式，多模态则把它们拼回同一个 Transformer。

**只想查一个概念**：用站内搜索，或直接看 [[ai/overview]] 这张地图本身。每篇开头都有一行指向相关篇的 wikilink，顺着爬比按目录读更符合这套笔记的组织方式。
