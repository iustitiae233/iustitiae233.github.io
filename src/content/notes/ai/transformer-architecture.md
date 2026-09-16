---
title: 'Transformer 架构——一个层的内部构造与 Pre-Norm 之争'
description: 'Transformer 层的两个子层（多头自注意力与前馈网络）、残差连接与 LayerNorm 的位置之争、FFN 为什么存储了模型大部分事实知识、SwiGLU 门控激活的作用，以及各位置激活函数的选择理由'
pubDate: '2026-09-16 16:08:00'
category: ai
tags: [Transformer, 前馈网络, LayerNorm]
---

Transformer 的宏大叙事只有一种砖块：**注意力子层 + 前馈子层，各自裹上残差与归一化**，然后重复几十上百次。注意力本身见 [[self-attention]]，残差与归一化的原理见 [[training-stability-and-regularization]]，层数堆叠带来的能力变化见 [[scaling-laws]]。本分类全部笔记见 [AI 原理](/notes/ai/)。

## 一、一个 Transformer 层的结构

$$\text{输入} \to [\text{多头自注意力}] \to [\text{残差} + \text{LayerNorm}] \to [\text{前馈网络}] \to [\text{残差} + \text{LayerNorm}] \to \text{输出}$$

![[ai-transformer-block.png|Transformer 编码器与解码器的整体架构图：左侧编码器与右侧解码器各自标注 Nx 表示层堆叠，解码器右分支多一个带掩码的多头自注意力与一个跨注意力子层；底部是嵌入层与位置编码，顶部经线性层输出预测概率]]

*图：这是**整机图**，不是单层图——左右两个虚框分别标注 $N\times$，表示框内那一块被重复堆叠 N 次，**框内就是本节讲的那一层**。左侧编码器的层只含两个子层（多头自注意力 → 前馈网络）；右侧解码器的层多了一个**带掩码的自注意力**（Masked，保证生成时看不到未来 token）和一个**跨注意力**（Q 来自解码器，K/V 来自编码器输出）——这是"仅解码器"的现代 LLM（[[llm-training-pipeline]]）已经砍掉的部分。每个子层统一裹 `残差 + LayerNorm`，与公式一致；底部的位置编码见 [[tokenization-and-embedding]]*

逐一解读：

| 部件 | 作用 |
|---|---|
| **多头自注意力** | 让当前层的每个 token 直接"看到"序列中所有 token，按语义相似度聚合上下文。语言理解的核心引擎（[[self-attention]]） |
| **残差连接** | 把子层的输入直接加到输出上，为梯度保留一条直达通道；导数里的 $+1$ 保证深层不退化 |
| **LayerNorm** | 对每个 token 的特征向量做归一化（均值 0、方差 1）再做可学习的缩放偏移，让梯度流更稳定 |
| **前馈网络（FFN / MLP）** | 一个两层全连接网络，中间维度通常是注意力维度的 4 倍。对每个 token 独立做非线性变换 |

FFN 的角色常被低估。一句话概括分工：**注意力让 token 之间交流，FFN 让每个 token 自己消化信息。** 大量研究表明 FFN 层存储了模型的大部分"知识"与"事实"——这也是为什么它有 4 倍于注意力的中间维度，参数量通常占全层三分之二。

## 二、Pre-Norm 与 Post-Norm

原始 Transformer 把 LayerNorm 放在子层**之后**（Post-Norm），后来的研究发现放在子层**之前**（Pre-Norm）训练更稳定、可以用更大的学习率。

| 布局 | 结构 | 特点 |
|---|---|---|
| Post-Norm | $\mathrm{LN}(x + \text{SubLayer}(x))$ | 原始论文做法；深层时需要小心的学习率 warmup |
| **Pre-Norm** | $x + \text{SubLayer}(\mathrm{LN}(x))$ | 残差通路上没有归一化，梯度可以无衰减地直达底层；现代 LLM（GPT-3 及之后）几乎全用这个 |

Pre-Norm 的好处正来自那条"干净"的残差通路——归一化被挪到了支路上，主干上的恒等映射不受干扰。

## 三、各位置的激活函数选择

不同位置用不同的激活函数，体现的是工程上的精细考量：

| 位置 | 常用激活 | 原因 |
|---|---|---|
| 注意力中的非线性 | Softmax | 把任意分数映射为概率分布 |
| FFN 中间层 | ReLU → GELU → SwiGLU | 逐代更平滑、更可控 |
| 最终输出层 | Softmax | 在所有 token 上归一化为概率分布 |

**SwiGLU 简释**。传统 FFN 是两层：$\mathrm{FFN}(x) = W_2 \cdot \sigma(W_1 x)$。SwiGLU 引入一个门控分支：

$$\mathrm{SwiGLU}(x) = W_2 \left( W_1 x \odot \mathrm{Swish}(W_g x) \right)$$

其中 $\odot$ 是按元素乘法。那个"门"让网络可以选择性地过滤信息，比固定的 ReLU / GELU 更灵活。PaLM 与 LLaMA 都采用了它。

> 💡 注意 SwiGLU 多了一个 $W_g$，为了保持总参数量不变，实现时通常把中间维度从 $4d$ 缩到约 $\frac{8}{3}d$——这是"换架构不换预算"的典型操作。

## 关于配图

本篇的架构图是 Vaswani 等人 2017 年论文《Attention Is All You Need》Figure 1 的**重绘版本**（非本站原创，配色与字号与原图有差异），版权归原作者所有。若需在正式场合引用，请以原论文图为准。

## 小结

| 要点 | 结论 |
|---|---|
| 层的构成 | 多头自注意力 + FFN，各裹一层残差与 LayerNorm |
| 分工 | 注意力负责 token 间交流，FFN 负责单 token 消化与知识存储 |
| FFN 的参数 | 中间维度约 4 倍注意力维度，占全层参数约三分之二 |
| Pre vs Post-Norm | Pre-Norm 残差通路无归一化干扰，是 GPT-3 之后的默认 |
| 激活函数 | 注意力与输出用 Softmax，FFN 从 ReLU 演进到 GELU / SwiGLU |
| SwiGLU | 门控变体，多一个 $W_g$，中间维度相应缩小以保持预算 |

*Transformer 层的设计哲学很克制：把"交流"和"思考"分成两个子层，剩下的全部工作交给残差和归一化去维持信号健康——然后在深度上重复它。*
