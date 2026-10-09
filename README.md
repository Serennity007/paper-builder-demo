# Paper Builder Demo · 国际数学组卷系统（静态演示版）

Live at https://serennity007.github.io/paper-builder-demo/

这是 [paper-builder-system](https://github.com/JennyBrian231/paper-builder-system) `e9894d8`（2026-10-09）四个模块的**纯静态移植**：GitHub Pages 不能运行 Python，所以后端 `backend/app.py` 提供的题卡接口在浏览器里用本地数据重新实现了一遍。

## 演示入口

- 教研后台：`index.html` 登录，账号 `teacher` / 密码 `123456`（`wangli` 同密码）
- 学生 P1 快速诊断：`diagnostic.html`（无需登录）
- 线索列表：`leads.html`，或在后台「诊断线索 / Leads」页签查看

## 可以看到什么

后台四个模块都跑在**真实题库**上，不是空壳：

- **原卷管理**：3 套 Edexcel IAL P1 原卷记录（2026 January ×2、Summer ×1），共 29 道题
- **题目管理**：29 道已确认裁剪题卡，按教材 Topic（9 个章节）或按原卷分组；跨页大题的多块裁图按顺序还原
- **组卷**：按卷型 / 教材版本 / 知识点 / 难度 / 来源年份 / 单题分钟上限筛选，「按条件选题」使用与后端一致的有界子集选择（凑目标分钟、不放宽筛选条件、如实提示缺口），可保存试卷并重新打开 5 份已存组卷快照
- **诊断线索**：8 道固定真题的学生自评流程，评分口径（权重与分类）与 `backend/diagnostic.py` 一致

题卡图片是预先从 PDF 原件裁剪出的 32 张 PNG（`assets/p1/regions/`），由 `js/p1-bank.js` 提供数据、`js/static-bank.js` 提供接口路由。

## 静态版不提供什么

原卷 PDF 与 Mark Scheme 不随本演示发布，因此以下功能会给出明确提示而不是静默失败：

- 「下载 QP / 下载 MS」整卷 PDF 合成、完整原卷页面预览
- 题目管理中的 MS 答案裁图（显示「MS 暂缺」）
- 新增教材目录、私有草稿的在线编辑
- 线索跨设备同步：本页提交的咨询线索只写入**提交者自己浏览器的 localStorage**，不会发送到服务器，也不会出现在其他设备上；诊断页已按此实情标注文案。需要真实收单请部署带 Flask 后端的版本

## 运行完整版本

```sh
pip install -r backend/requirements.txt
python backend/serve_student.py   # 后台 http://127.0.0.1:8953/admin.html · 学生 /diagnostic
```

## 与上一版演示的说明

此前的线上演示用 `answer.html` + 答题码 `ZX2026` 收在线作答。该入口在本次部署前就已无法进入（提示「考试不存在或未开启在线作答」），且在线答题与打印页属于本版本移除的旧模块，故本次不再发布这两个页面。
