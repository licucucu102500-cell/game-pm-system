// 演示数据：所有日期以"今天"为基准生成，保证任何时候打开，项目都处于"CBT1 冲刺中"的真实状态
const DAY = 86400000;
function fmt(t) {
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function d(n) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + n); return fmt(t); }
function addDays(s, n) { const t = new Date(s + 'T00:00:00'); t.setDate(t.getDate() + n); return fmt(t); }
function diffDays(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY); }
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

const DISCIPLINES = { 策划: '#7c5cff', 程序: '#2f80ed', 美术: '#f2994a', 测试: '#27ae60', 音频: '#e5484d' };

function seedData() {
  const members = [
    { name: '王岚', role: '制作人', disc: '管理', cap: 0 },
    { name: '我', role: '项目经理', disc: '管理', cap: 0 },
    { name: '陈默', role: '系统策划', disc: '策划', cap: 5 },
    { name: '赵一舟', role: '关卡策划', disc: '策划', cap: 5 },
    { name: '林夕', role: '数值策划', disc: '策划', cap: 5 },
    { name: '周航', role: '主程', disc: '程序', cap: 5 },
    { name: '孙磊', role: '客户端', disc: '程序', cap: 5 },
    { name: '何畅', role: '客户端', disc: '程序', cap: 5 },
    { name: '郑凯', role: '服务器', disc: '程序', cap: 5 },
    { name: '许诺', role: '主美', disc: '美术', cap: 5 },
    { name: '唐糖', role: '角色美术', disc: '美术', cap: 5 },
    { name: '冯远', role: '场景美术', disc: '美术', cap: 5 },
    { name: '曹可', role: '特效/动作', disc: '美术', cap: 5 },
    { name: '吕青', role: '测试主管', disc: '测试', cap: 5 },
    { name: '韩梅', role: '测试', disc: '测试', cap: 5 },
    { name: '声音工坊', role: '音频外包', disc: '音频', cap: 5 },
  ];

  const milestones = [
    { id: 'M1', name: '立项评审', date: d(-240), status: 'done', desc: '核心玩法、目标用户、预算与团队规模评审通过', gates: ['玩法原型可玩', '商业化方向确认', '预算审批'] },
    { id: 'M2', name: '垂直切片 Demo', date: d(-150), status: 'done', desc: '一个完整关卡达到上线品质，验证美术风格与核心战斗', gates: ['单关卡达到目标品质', '美术风格定稿', '核心战斗验证'] },
    { id: 'M3', name: 'Alpha', date: d(-60), status: 'done', desc: '核心系统功能完整，可进行内部全流程体验', gates: ['核心系统功能完整', '内部全流程可玩', '技术架构定型'] },
    { id: 'M4', name: 'CBT1 首次删档测试', date: d(35), status: 'active', desc: '面向 2 万名玩家的首次删档测试，验证留存与战斗口碑', gates: ['P0 需求 100% 完成', 'S 级 Bug 清零，A 级 ≤ 5', '服务器压测达标', '防沉迷/实名认证接入'] },
    { id: 'M5', name: 'CBT2 不删档测试', date: d(120), status: 'future', desc: '验证付费模型与中期留存', gates: ['付费系统上线', '次留 ≥ 45%'] },
    { id: 'M6', name: '公测上线', date: d(200), status: 'future', desc: '全渠道公测', gates: ['版号获批', '全渠道上架'] },
  ];

  const sprints = [
    { id: 'S17', name: 'Sprint 17', start: d(-20), end: d(-7), goal: '第一章核心内容生产 + 账号服务' },
    { id: 'S18', name: 'Sprint 18', start: d(-6), end: d(7), goal: '新手引导、抽卡系统打通；性能与压测基线建立' },
    { id: 'S19', name: 'Sprint 19', start: d(8), end: d(21), goal: '第二章内容、渠道 SDK、性能优化' },
    { id: 'S20', name: 'Sprint 20', start: d(22), end: d(35), goal: 'CBT1 封版、全量回归、出包提审' },
  ];

  // [id, 标题, 工种, 负责人, 迭代, 优先级, 估算人日, 开始偏移, 结束偏移, 状态, 进度, 依赖, 完成偏移]
  const T = [
    ['T101', '新手引导流程策划案', '策划', '赵一舟', 'S17', 'P0', 6, -20, -12, 'done', 100, [], -13],
    ['T102', '战斗系统 - 连携技能实现', '程序', '孙磊', 'S17', 'P0', 8, -20, -9, 'done', 100, [], -9],
    ['T103', '主城场景白盒', '美术', '冯远', 'S17', 'P1', 10, -20, -8, 'done', 100, [], -8],
    ['T104', '角色「艾琳」模型与绑定', '美术', '唐糖', 'S17', 'P0', 10, -20, -7, 'done', 100, [], -7],
    ['T105', '账号与登录服务', '程序', '郑凯', 'S17', 'P0', 8, -20, -10, 'done', 100, [], -10],
    ['T106', '养成线数值框架 v2', '策划', '林夕', 'S17', 'P0', 8, -20, -9, 'done', 100, [], -10],
    ['T206', '抽卡概率与保底规则策划案', '策划', '林夕', 'S18', 'P0', 3, -8, -4, 'done', 100, ['T106'], -4],
    ['T201', '新手引导功能开发', '程序', '何畅', 'S18', 'P0', 8, -6, 5, 'doing', 60, ['T101'], null],
    ['T202', '新手引导 UI 与美术资源', '美术', '许诺', 'S18', 'P1', 6, -6, 3, 'doing', 70, ['T101'], null],
    ['T203', '主城场景美术精修', '美术', '冯远', 'S18', 'P1', 12, -6, 10, 'doing', 40, ['T103'], null],
    ['T204', '角色「艾琳」技能特效', '美术', '曹可', 'S18', 'P0', 8, -6, 4, 'review', 90, ['T104'], null],
    ['T205', '抽卡系统（卡池/保底/动画）', '程序', '孙磊', 'S18', 'P0', 8, -6, 4, 'doing', 75, ['T206'], null],
    ['T207', '客户端性能基线（低端机）', '程序', '周航', 'S18', 'P0', 6, -6, 7, 'doing', 50, [], null],
    ['T208', '服务器压测方案与脚本', '程序', '郑凯', 'S18', 'P0', 6, -4, 5, 'doing', 30, ['T105'], null],
    ['T209', '第一章主线关卡配置', '策划', '赵一舟', 'S18', 'P0', 8, -6, 7, 'doing', 50, ['T101'], null],
    ['T210', '战斗手感调优（受击/顿帧）', '策划', '陈默', 'S18', 'P1', 5, -6, -1, 'doing', 80, ['T102'], null],
    ['T211', 'CBT1 测试用例编写', '测试', '吕青', 'S18', 'P0', 6, -6, 4, 'doing', 60, [], null],
    ['T212', '冒烟测试自动化脚本', '测试', '韩梅', 'S18', 'P2', 5, -3, 7, 'todo', 0, [], null],
    ['T213', '第一章主线剧情配音', '音频', '声音工坊', 'S18', 'P1', 6, -10, 6, 'doing', 30, ['T209'], null],
    ['T214', '防沉迷与实名认证接入', '程序', '郑凯', 'S18', 'P0', 4, 1, 6, 'todo', 0, ['T105'], null],
    ['T301', '第二章主线关卡配置', '策划', '赵一舟', 'S19', 'P1', 8, 8, 20, 'todo', 0, ['T209'], null],
    ['T302', '公会系统策划案（CBT2 预研）', '策划', '陈默', 'S19', 'P3', 5, 3, 12, 'todo', 0, [], null],
    ['T303', '角色「洛伦」模型与绑定', '美术', '唐糖', 'S19', 'P0', 10, -4, 12, 'doing', 20, [], null],
    ['T304', '角色「洛伦」技能特效', '美术', '曹可', 'S19', 'P0', 8, 13, 24, 'todo', 0, ['T303'], null],
    ['T305', '渠道 SDK 接入（TapTap / B站）', '程序', '何畅', 'S19', 'P0', 6, 8, 16, 'todo', 0, [], null],
    ['T306', '数据埋点与 BI 上报', '程序', '孙磊', 'S19', 'P1', 6, 8, 17, 'todo', 0, [], null],
    ['T307', '低端机性能优化（内存/DrawCall）', '程序', '周航', 'S19', 'P0', 10, 8, 25, 'todo', 0, ['T207'], null],
    ['T308', '服务器压测执行与调优', '程序', '郑凯', 'S19', 'P0', 6, 8, 18, 'todo', 0, ['T208'], null],
    ['T309', '第一章全流程回归测试', '测试', '吕青', 'S19', 'P0', 6, 10, 20, 'todo', 0, ['T209', 'T201'], null],
    ['T310', '兼容性测试（机型矩阵）', '测试', '韩梅', 'S19', 'P1', 6, 10, 21, 'todo', 0, ['T207'], null],
    ['T311', '战斗 BGM 与音效', '音频', '声音工坊', 'S19', 'P1', 8, 0, 20, 'doing', 10, [], null],
    ['T401', 'CBT1 版本封版', '程序', '周航', 'S20', 'P0', 2, 27, 29, 'todo', 0, ['T307', 'T308', 'T305'], null],
    ['T402', 'CBT1 全量回归与验收', '测试', '吕青', 'S20', 'P0', 8, 22, 32, 'todo', 0, ['T309', 'T310'], null],
    ['T403', '首测福利与活动配置', '策划', '林夕', 'S20', 'P1', 4, 22, 28, 'todo', 0, [], null],
    ['T404', '宣传素材（PV / 主视觉）', '美术', '许诺', 'S20', 'P1', 8, 15, 30, 'todo', 0, ['T204'], null],
    ['T405', '测试问卷与反馈渠道', '策划', '陈默', 'S20', 'P2', 2, 25, 30, 'todo', 0, [], null],
    ['T406', '渠道包出包与提审', '程序', '何畅', 'S20', 'P0', 3, 30, 34, 'todo', 0, ['T401', 'T305'], null],
  ];
  const tasks = T.map(r => ({
    id: r[0], title: r[1], disc: r[2], owner: r[3], ms: 'M4', sprint: r[4], pri: r[5], est: r[6],
    start: d(r[7]), end: d(r[8]), status: r[9], progress: r[10], deps: r[11], doneDate: r[12] == null ? null : d(r[12]),
  }));

  // 缺陷数据：固定种子随机生成，保证每次重置结果一致
  const R = rng(20261028);
  const pick = a => a[Math.floor(R() * a.length)];
  const BUGT = {
    战斗: ['连携技能释放后角色卡在硬直状态', '受击顿帧在高帧率下不生效', '闪避无敌帧判定异常', '技能冷却 UI 与实际不一致'],
    新手引导: ['引导第 3 步点击区域偏移', '跳过引导后任务状态未同步', '引导遮罩在刘海屏显示异常'],
    抽卡: ['十连抽保底计数未正确累加', '卡池倒计时显示错误', '抽卡历史记录缺失'],
    主城: ['主城 NPC 穿模', '小地图图标错位', '昼夜切换时光照闪烁'],
    UI: ['背包排序按钮无响应', '设置界面文字溢出', '商城价格缺少货币符号', '弹窗叠加后无法关闭'],
    账号登录: ['断线重连后登录态丢失', '实名认证弹窗重复出现'],
    网络同步: ['弱网下组队状态不同步', '服务器重启后玩家位置回滚'],
    性能: ['低端机进入主城内存峰值超 1.5G', '战斗场景 DrawCall 过高导致掉帧', '长时间游戏后发热严重'],
    音频: ['战斗 BGM 切换时出现爆音', '角色语音与字幕不同步'],
  };
  const OWNER = { 战斗: '孙磊', 新手引导: '何畅', 抽卡: '孙磊', 主城: '冯远', UI: '何畅', 账号登录: '郑凯', 网络同步: '郑凯', 性能: '周航', 音频: '声音工坊' };
  const ENV = ['Android', 'iOS', '低端机', 'PC 模拟器'];
  const bugs = [];
  for (let i = 0; i < 86; i++) {
    const mod = pick(Object.keys(BUGT));
    const age = Math.floor(Math.pow(R(), 1.3) * 40);
    const r = R();
    const sev = r < 0.04 ? 'S' : r < 0.22 ? 'A' : r < 0.68 ? 'B' : 'C';
    const closeP = Math.min(0.95, 0.15 + age / 16 + (sev === 'S' || sev === 'A' ? 0.25 : 0));
    const closed = sev === 'S' || R() < closeP;
    const created = d(-age);
    let status = '已关闭', closedDate = null;
    if (closed && age > 0) closedDate = addDays(created, 1 + Math.floor(R() * Math.min(age - 1, sev === 'C' ? 8 : 4)));
    else status = pick(sev === 'C' ? ['新建', '处理中', '延期处理', '延期处理'] : ['新建', '处理中', '处理中', '待验证']);
    bugs.push({ id: 'B' + (1001 + i), title: `[${pick(ENV)}] ${pick(BUGT[mod])}`, sev, mod, owner: OWNER[mod], status, created, closed: closedDate, ver: 'CBT1-0.8' });
  }
  bugs.push({ id: 'B1087', title: '[Android] Boss 二阶段转换时偶现闪退', sev: 'S', mod: '战斗', owner: '孙磊', status: '处理中', created: d(-2), closed: null, ver: 'CBT1-0.8' });
  bugs.push({ id: 'B1088', title: '[iOS] 抽卡动画跳过后奖励未到账', sev: 'S', mod: '抽卡', owner: '孙磊', status: '新建', created: d(-1), closed: null, ver: 'CBT1-0.8' });

  const risks = [
    { id: 'R01', title: '版号审批周期不确定，影响公测时间', cat: '合规', prob: 3, impact: 5, owner: '王岚', status: '应对中', trigger: '送审后 60 天无反馈', mitigation: 'CBT 阶段同步准备送审材料；公测计划预留 ±2 个月缓冲', contingency: '先开放不删档测试维持热度，营销节奏整体后移' },
    { id: 'R02', title: '服务器压测不达标（目标 3000 CCU）', cat: '技术', prob: 3, impact: 5, owner: '郑凯', status: '监控中', trigger: '第一轮压测结果 < 2000 CCU', mitigation: 'Sprint 19 完成压测并预留 1 周调优；提前申请云服务器弹性扩容', contingency: '缩减首批测试资格发放数量，分批开服' },
    { id: 'R03', title: '主程单点依赖（核心战斗、性能均依赖周航）', cat: '人员', prob: 3, impact: 4, owner: '我', status: '应对中', trigger: '主程请假 / 负载 > 120%', mitigation: '关键模块文档化；孙磊作为战斗模块 B 角结对开发', contingency: '向技术中台申请临时支援' },
    { id: 'R04', title: '外包配音交付延期', cat: '外部', prob: 4, impact: 3, owner: '我', status: '应对中', trigger: '单批次交付延期 > 3 天', mitigation: '每周对齐交付清单、分批验收；合同约定延期条款', contingency: '先用 TTS 占位，CBT1 仅保留主线关键配音' },
    { id: 'R05', title: '低端机性能不达标（目标 30fps / 内存 ≤ 1.2G）', cat: '技术', prob: 4, impact: 4, owner: '周航', status: '应对中', trigger: '基线测试 < 25fps', mitigation: '建立性能基线与每日自动化跑分；美术资源制定面数/贴图预算', contingency: '低端机默认开启"流畅模式"，关闭部分后处理' },
    { id: 'R06', title: '封版前需求持续变更导致范围蔓延', cat: '进度', prob: 4, impact: 4, owner: '我', status: '监控中', trigger: '冻结后仍有 P0/P1 新需求插入', mitigation: '封版前 3 周需求冻结；之后变更走变更评审（CCB），评估影响后由制作人拍板', contingency: '非核心需求移至 CBT2' },
    { id: 'R07', title: '战斗手感在测试中口碑不佳', cat: '产品', prob: 2, impact: 5, owner: '陈默', status: '监控中', trigger: '内部体验评分 < 7 分', mitigation: '每周一次内部体验会；邀请核心玩家焦点小组测试', contingency: 'CBT1 后集中一个迭代专项调优' },
    { id: 'R08', title: '渠道 SDK 版本更新导致返工', cat: '外部', prob: 2, impact: 3, owner: '何畅', status: '监控中', trigger: '渠道发布强制更新通知', mitigation: '锁定 SDK 版本，与渠道对接人建立周同步', contingency: '预留 2 人日缓冲' },
    { id: 'R09', title: '个人信息收集清单未通过合规审核', cat: '合规', prob: 2, impact: 4, owner: '郑凯', status: '监控中', trigger: '法务审核意见 > 3 条', mitigation: '提前与法务过清单；第三方 SDK 逐一核查', contingency: '下线非必要的数据采集项' },
    { id: 'R10', title: '角色美术产能不足（CBT1 需 4 名可玩角色）', cat: '资源', prob: 3, impact: 3, owner: '许诺', status: '应对中', trigger: '单角色制作 > 12 人日', mitigation: '角色原画外包，内部专注模型与特效', contingency: 'CBT1 可玩角色降为 3 名' },
    { id: 'R11', title: '核心成员流失', cat: '人员', prob: 1, impact: 4, owner: '王岚', status: '已关闭', trigger: '-', mitigation: '季度一对一沟通；项目奖金与里程碑挂钩', contingency: '-' },
  ];

  const decisions = [
    { date: d(-60), topic: 'Alpha 复盘：战斗方向', decision: '战斗采用"轻动作 + 角色连携"方向，砍掉体力系统', reason: '内部体验显示体力系统打断节奏，且与目标用户（轻中度二次元玩家）不匹配', owner: '王岚', impact: '战斗模块返工约 15 人日' },
    { date: d(-45), topic: 'CBT1 测试范围', decision: 'CBT1 包含 4 名可玩角色、第一/二章主线、抽卡与养成；公会系统延至 CBT2', reason: 'CBT1 核心目标是验证战斗口碑与次日留存，社交系统非验证重点', owner: '王岚', impact: '范围缩减约 40 人日' },
    { date: d(-30), topic: '音频生产方式', decision: '音频改为外包（声音工坊），内部保留 1 名接口人', reason: '内部无专职音频，招聘周期长于 CBT1 时间窗口', owner: '我', impact: '新增外部依赖风险 R04' },
    { date: d(-18), topic: '需求冻结机制', decision: '封版前 3 周冻结需求，之后所有变更走变更评审（CCB）', reason: 'Alpha 阶段封版前一周插入 9 个需求，导致 2 次延期', owner: '我', impact: '需求变更需评估影响并由制作人审批' },
    { date: d(-9), topic: '性能目标', decision: '中端机 60fps、低端机 30fps，内存峰值 ≤ 1.2G', reason: '目标用户中低端机占比约 35%（参考竞品与渠道数据）', owner: '周航', impact: '美术资源需按预算重新评估' },
    { date: d(-3), topic: '压测目标调整', decision: 'CBT1 压测目标由 5000 CCU 调整为 3000 CCU', reason: '首测仅发放 2 万资格，按 15% 同时在线率预估峰值约 3000', owner: '王岚', impact: '服务器优化工作量减少约 4 人日' },
  ];

  const checklist = [
    ['合规', '软件著作权登记', true], ['合规', '防沉迷与实名认证接入', false], ['合规', '隐私政策与个人信息收集清单', true],
    ['合规', '用户协议法务审核', true], ['合规', '测试资格发放规则公示', false],
    ['技术', '服务器压测达标（3000 CCU）', false], ['技术', '回滚方案与演练', false], ['技术', '线上监控与告警配置', true],
    ['技术', '热更新流程验证', false], ['技术', '数据埋点验证', false],
    ['内容', '第一/二章主线可完整通关', false], ['内容', '新手引导完整且可跳过', false], ['内容', '本地化文本校对', true],
    ['运营', '测试问卷与反馈渠道', false], ['运营', '客服 FAQ 与应急话术', false], ['运营', '首测福利配置', false], ['运营', '社群公告排期', true],
    ['渠道', 'TapTap / B站 测试页面上线', true], ['渠道', '渠道包出包与提审', false],
  ].map((r, i) => ({ id: 'C' + i, cat: r[0], text: r[1], done: r[2] }));

  return {
    version: 1,
    seededOn: d(0),
    project: { name: '星海回响', genre: '二次元开放世界 RPG · 手游', team: members.length },
    members, milestones, sprints, tasks, bugs, risks, decisions, checklist,
  };
}
