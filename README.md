# 插叙（Interlude）

给 SillyTavern 加一个「写一段旁支场景，写完后作为正文的一部分留在聊天记录里」的入口。

现有的小剧场类插件（例如 st-theater）能把场景生成得很好，但结果存在自己的存档里，主聊天那边不知道发生过什么。这个扩展只做缺的那一步：**把生成结果作为一条普通消息追加进当前聊天并保存。**

## 安装

### 方式一：手动放目录（开发时用这个）

把整个 `st-interlude/` 目录放到下面任一路径：

```
SillyTavern/data/<你的用户句柄>/extensions/st-interlude/
SillyTavern/public/scripts/extensions/third-party/st-interlude/
```

推荐第一种：`data/` 下的东西在升级酒馆时不会被覆盖，`public/` 下的会。

放好后**硬刷新页面**（Ctrl+F5），打开「扩展」面板，展开「插叙 · 小剧场」。

### 方式二：从 Git 仓库安装（发布后）

扩展面板 → `Install Extension` → 粘贴仓库 URL → 装完刷新。

## 用法

1. 在输入框写一句要什么场景，例如「A 出门后，B 和 C 在客厅，B 想问 C 学校里的事，C 不想说」
2. 点「生成小剧场」——后台静默生成，不打断当前聊天
3. 结果出现在预览区，可以直接编辑
4. 点「写入正文」，作为一条名为「小剧场」的消息追加到聊天末尾并保存

## 用到的三个接口

| 接口 | 用途 |
| --- | --- |
| `SillyTavern.getContext()` | 拿 `chat` / `saveChat` / `addOneMessage` / `extensionSettings` |
| `ctx.generateQuietPrompt({ quietPrompt })` | 在当前聊天上下文中后台生成，结果不渲染进 UI |
| `ctx.chat` + `ctx.saveChat()` | 读写当前聊天的消息数组并落盘 |

生成的上下文由酒馆自己拼（角色卡、世界书、预设、最近聊天），扩展不重复实现这套逻辑——这正是 st-theater 花了两万多行去做、而我们不需要的部分。

## 待验证

以下三点需要在真实实例上确认一次，属于接口行为差异，不是逻辑问题：

1. **`addOneMessage` 是否自己往 `chat` 里 push。** 代码用「插入前后 `ctx.chat.length` 的差值」判断，理论上两种行为都能兜住，但要实际看一眼有没有重复插入。
2. **写入后是否自动重绘。** 若 `addOneMessage` 不存在或没触发渲染，会走 `reloadCurrentChat` 兜底；再不行就提示手动切换聊天。
3. **`generateQuietPrompt` 是否挂在 `context` 上。** 代码优先取 `ctx.generateQuietPrompt`，取不到时动态 import `script.js`。

## 后续

- 生成时可选「取正文哪一段当背景」（目前固定取当前聊天）
- 小剧场存档与回看
- 多条小剧场的字数统计
