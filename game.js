/**
 * My Class - 游戏主逻辑
 *
 * 架构：DOM操作 + Web Audio API 合成音效
 * 核心循环：出题 → AI举手 → 玩家点名 → 学生回答 → 下一题
 */

// --- DOM 元素引用 ---
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const teacherNameInput = document.getElementById('teacherName');
const newGameBtn = document.getElementById('newGameBtn');
const nameError = document.getElementById('nameError');
const savesList = document.getElementById('savesList');
const noSavesTip = document.getElementById('noSavesTip');

// --- 商店和背包面板 ---
const shopBtn = document.getElementById('shopBtn');
const inventoryBtn = document.getElementById('inventoryBtn');
const shopPanel = document.getElementById('shopPanel');
const inventoryPanel = document.getElementById('inventoryPanel');
const shopCloseBtn = document.getElementById('shopCloseBtn');
const inventoryCloseBtn = document.getElementById('inventoryCloseBtn');
const inventoryItems = document.getElementById('inventoryItems');
const inventoryEmpty = document.getElementById('inventoryEmpty');

// --- 常量 ---
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何'];
const BOY_NAMES = ['宇轩', '浩然', '子豪', '博文', '天佑', '明辉', '思远', '嘉诚', '俊杰', '子墨', '一鸣', '志强', '建国', '小龙', '大壮'];
const GIRL_NAMES = ['诗涵', '雨萱', '欣怡', '梦琪', '佳怡', '子涵', '美玲', '晓月', '思语', '心怡', '雅琪', '紫萱', '若溪', '婉清', '静怡'];

/** 搞笑回答池：淘气学生乱答时使用 */
const FUNNY_ANSWERS = [
  '42！宇宙的终极答案！',
  '呃……100万？',
  '老师，这题超纲了吧！',
  '我选C！',
  '答案是……恐龙？🦕',
  '让我掰手指算算……掰不过来了',
  '我妈说不能告诉别人答案',
  '这题我昨天做过！但忘了……',
  '老师你出错题了吧？',
  '答案在风中飘扬～🎵',
  '我的计算器没电了……',
  '老师，我要打电话求助！📞',
];

/** 没在听讲的学生被点名时的回应 */
const SLEEPY_ANSWERS = [
  '啊？老师我没听清……',
  '等等……你说什么？',
  '我……我刚在看窗外的小鸟……🐦',
  '嗯？现在到我了吗？',
  '老师，能再说一遍题目吗？',
  '不好意思，我走神了……😅',
];

/**
 * 学生座位邻座关系（3×2 布局）
 *  [0][1][2]
 *  [3][4][5]
 * 设计理由：传纸条事件需知道谁挨着谁
 */
const STUDENT_NEIGHBORS = [
  [1, 3],      // 0号：右、后
  [0, 2, 4],   // 1号：左、右、后
  [1, 5],      // 2号：左、后
  [0, 4],      // 3号：前、右
  [1, 3, 5],   // 4号：前、左、右
  [2, 4],      // 5号：前、左
];

// --- 工具函数 ---

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================
//  音效系统 - Web Audio API 合成
// ============================================

/**
 * 使用 Web Audio API 合成所有音效。
 * 设计理由：无需加载外部音频文件，纯浏览器原生生成。
 */
const SoundFX = {
  _ctx: null,

  /** 惰性初始化 AudioContext（浏览器要求首次用户交互后才能创建） */
  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  },

  /** 粉笔唰唰音效：使用白噪声 + 带通滤波器模拟 */
  chalkWrite() {
    const ctx = this._getCtx();
    const duration = 0.6;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 生成白噪声
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    // 用断续包络模拟多笔画"唰唰"
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const strokeCycle = Math.sin(t * 12) > 0 ? 1 : 0.1;
      const fade = 1 - (t / duration);
      data[i] *= strokeCycle * fade;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0.15;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);
  },

  /** 叮！点名学生回答的清脆音效 */
  ding() {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  },

  /** 正确答案：上升旋律 */
  correct() {
    const ctx = this._getCtx();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  },

  /** 错误答案：低沉下降音 */
  wrong() {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  },

  /** 校长惩罚：沉重警告音 */
  punish() {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.9);
  },

  /** 纸飞机「嗖——」音效：白噪声 + 快速下降频率模拟风切声 */
  whoosh() {
    const ctx = this._getCtx();
    const duration = 0.45;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / duration, 1.5) * 0.4;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(300, ctx.currentTime + duration);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);
  },

  /** 纸条被没收「啊哦」下降音效 */
  caught() {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  },

  /** 下课颓「叮鐵鐵——」：多个高频正弦波模拟金属钓声 */
  bell() {
    const ctx = this._getCtx();
    [1047, 1319, 1047, 1319, 1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  },

  /** 课间喚弄声：快速短方波模拟叽叽喵喵吹闹声 */
  chatter() {
    const ctx = this._getCtx();
    for (let i = 0; i < 12; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 150 + Math.random() * 350;
      const t = ctx.currentTime + i * 0.06 + Math.random() * 0.02;
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  },

  /** 啪！短促粉红噪声模拟身体拍打/拉拽声 */
  pa() {
    const ctx = this._getCtx();
    const duration = 0.1;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      let white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.1;
      b6 = white * 0.115926;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);
  }
};

// ============================================
//  学生数据模型
// ============================================

function generateStudents() {
  const usedBoyNames = new Set();
  const usedGirlNames = new Set();

  function generateUniqueName(gender) {
    const surname = randomPick(SURNAMES);
    const namePool = gender === '男' ? BOY_NAMES : GIRL_NAMES;
    const usedSet = gender === '男' ? usedBoyNames : usedGirlNames;
    let givenName;
    do {
      givenName = randomPick(namePool);
    } while (usedSet.has(givenName));
    usedSet.add(givenName);
    return surname + givenName;
  }

  // 即使是学霸初始数值也不超过50
  const accuracyTiers = shuffle([
    { tier: '学霸', accuracy: randomInt(40, 49) },
    { tier: '学霸', accuracy: randomInt(40, 49) },
    { tier: '普通', accuracy: randomInt(25, 39) },
    { tier: '普通', accuracy: randomInt(25, 39) },
    { tier: '学渣', accuracy: randomInt(5, 24) },
    { tier: '学渣', accuracy: randomInt(5, 24) },
  ]);

  // 固定：男, 女, 女, 男, 男, 女
  const genderOrder = ['男', '女', '女', '男', '男', '女'];
  const students = [];

  for (let i = 0; i < 6; i++) {
    const gender = genderOrder[i];
    const name = generateUniqueName(gender);
    const { tier, accuracy } = accuracyTiers[i];

    let naughty;
    if (tier === '学渣') naughty = randomInt(35, 49);
    else if (tier === '普通') naughty = randomInt(20, 34);
    else naughty = randomInt(5, 19);

    students.push({
      id: i,
      name,
      gender,
      tier,
      accuracy,
      naughty,
      attention: randomInt(10, 49),
      mood: randomInt(20, 49),
      isRaising: false,   // 当前是否举手
      isSleeping: false,   // 当前是否在打瞌睡
    });
  }
  return students;
}

// ============================================
//  DOM 元素引用
// ============================================
const chalkText = document.getElementById('chalkText');

// ============================================
//  特效与评判面板 DOM 引用
// ============================================
const effectsContainer = document.getElementById('effectsContainer');
const judgmentPanel = document.getElementById('judgmentPanel');
const judgmentStatement = document.getElementById('judgmentStatement');
const btnJudgeCorrect = document.getElementById('btnJudgeCorrect');
const btnJudgeWrong = document.getElementById('btnJudgeWrong');
const flashRedOverlay = document.getElementById('flashRedOverlay');
const principalHead = document.getElementById('principalHead');

// ============================================
//  游戏状态
// ============================================

const gameState = {
  teacherName: '',
  teacherGender: '男',
  salary: 10000,
  students: generateStudents(),
  activeTooltipStudentId: null,
  // --- 上课互动系统 ---
  currentQuestion: null,      // 当前题目对象 {text, answer}
  questionPhase: 'idle',      // idle | asking | answering | evaluating
  questionCount: 0,           // 已出题计数
  completedQuestionCount: 0,  // 已完成题目计数（答对才算完成）

  // 评判临时状态
  evaluatingStudentData: null,
  evaluatingStudentEl: null,
  actualIsCorrect: null,
  eventActive: false,
  // --- 课间系统 ---
  isBreakTime: false,
  breakAvatars: [],        // 课间漫游的学生小圆块
  breakAnimId: null,       // requestAnimationFrame ID
  breakEventTimer: null,   // 课间事件 setInterval ID
  // --- 暂停系统 ---
  isPaused: false,         // 游戏是否暂停
  // --- 背包系统 ---
  inventory: {
    megaphone: 0,    // 超级大喇叭
    ruler: 0,        // 无敌戒尺
    homework: 0,     // 课后习题
    flower: 0        // 无尽小红花
  }
};

// ============================================
//  数学出题系统
// ============================================

/**
 * 生成一道三年级数学题
 * @returns {{text: string, answer: any, wrongAnswers?: any[], isMultipleChoice?: boolean}} 题目文字和正确答案及错误备选项
 */
function generateMathQuestion() {
  const typeRoll = Math.random();
  let text = '';
  let answer;
  let wrongAnswers = [];

  if (typeRoll < 0.35) {
    // 1. 加减法
    const subType = Math.random();
    if (subType < 0.33) {
      // 两位数 ± 两位数（不进位、进位、不退位、退位都有）
      const op = Math.random() > 0.5 ? '+' : '-';
      const a = randomInt(11, 99);
      if (op === '+') {
        const b = randomInt(11, 99);
        text = `${a} + ${b} = ?`;
        answer = a + b;
      } else {
        const b = randomInt(11, a - 1);
        text = `${a} - ${b} = ?`;
        answer = a - b;
      }
    } else if (subType < 0.66) {
      // 三位数 ± 两位数
      const op = Math.random() > 0.5 ? '+' : '-';
      const a = randomInt(100, 999);
      if (op === '+') {
        const b = randomInt(10, 99);
        text = `${a} + ${b} = ?`;
        answer = a + b;
      } else {
        const b = randomInt(10, 99);
        text = `${a} - ${b} = ?`;
        answer = a - b;
      }
    } else {
      // 三位数 ± 整百数
      const op = Math.random() > 0.5 ? '+' : '-';
      const a = randomInt(100, 990);
      const bChoices = [100, 200, 300, 400, 500, 600, 700, 800, 900];
      if (op === '+') {
        const b = randomPick(bChoices.filter(x => x + a <= 1500)) || 100;
        text = `${a} + ${b} = ?`;
        answer = a + b;
      } else {
        const b = randomPick(bChoices.filter(x => x < a)) || 100;
        text = `${a} - ${b} = ?`;
        answer = a - b;
      }
    }
  } else if (typeRoll < 0.70) {
    // 2. 乘除法
    const subType = Math.random();
    if (subType < 0.25) {
      // 表内乘法
      const a = randomInt(2, 9), b = randomInt(2, 9);
      text = `${a} × ${b} = ?`;
      answer = a * b;
    } else if (subType < 0.5) {
      // 表内除法
      const a = randomInt(2, 9), b = randomInt(2, 9);
      const prod = a * b;
      text = `${prod} ÷ ${a} = ?`;
      answer = b;
    } else if (subType < 0.65) {
      // 两位数 × 一位数（简单、不进位或少进位）
      const a = randomInt(11, 49);
      const b = randomInt(2, 5);
      text = `${a} × ${b} = ?`;
      answer = a * b;
    } else if (subType < 0.85) {
      // 整十、整百数 × 一位数
      const a = randomPick([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500]);
      const b = randomInt(2, 9);
      text = `${a} × ${b} = ?`;
      answer = a * b;
    } else {
      // 两位数 ÷ 一位数（整除）
      const b = randomInt(2, 9);
      const answerVal = randomInt(11, 49);
      const prod = answerVal * b;
      text = `${prod} ÷ ${b} = ?`;
      answer = answerVal;
    }
  } else if (typeRoll < 0.85) {
    // 3. 单位与简单估算
    const converters = [
      { text: "1 时 = () 分", a: 60, w: [100, 10, 3600] },
      { text: "1 分 = () 秒", a: 60, w: [100, 10, 3600] },
      { text: "3 千克 = () 克", a: 3000, w: [300, 30, 30000] },
      { text: "5000 克 = () 千克", a: 5, w: [50, 500, 50000] },
      { text: "1 千米 = () 米", a: 1000, w: [100, 10, 10000] },
      { text: "2 米 = () 厘米", a: 200, w: [20, 2000, 2] },
      { text: "40 毫米 = () 厘米", a: 4, w: [400, 40, 0] },
      { text: "估算：49 + 52 大约是？", a: 100, w: [110, 90, 101] },
      { text: "估算：298 + 103 大约是？", a: 400, w: [300, 500, 401] }
    ];
    const pick = randomPick(converters);
    text = pick.text;
    answer = pick.a;
    wrongAnswers = pick.w;
  } else {
    // 4. 应用题
    const apps = [
      { q: "一本书有 65 页，小明看了 28 页\n还剩多少页没看？", options: ["A. 37", "B. 47", "C. 93"], a: "A", w: ["B", "C"] },
      { q: "一盒铅笔有 8 支\n5 盒一共有多少支？", options: ["A. 13", "B. 40", "C. 48"], a: "B", w: ["A", "C"] },
      { q: "妈妈买了 30 个苹果\n平均分给 5 个小朋友，每人分几个？", options: ["A. 5", "B. 6", "C. 7"], a: "B", w: ["A", "C"] },
      { q: "三角尺上有几个直角？", options: ["A. 1 个", "B. 2 个", "C. 3 个"], a: "A", w: ["B", "C"] },
      { q: "比直角小的角叫？", options: ["A. 钝角", "B. 锐角", "C. 直角"], a: "B", w: ["A", "C"] },
      { q: "比直角大的角叫？", options: ["A. 锐角", "B. 直角", "C. 钝角"], a: "C", w: ["A", "B"] },
      { q: "正方形是特殊的？", options: ["A. 三角形", "B. 长方形", "C. 圆"], a: "B", w: ["A", "C"] },
      { q: "一个正方形周长 20 厘米，边长是？", options: ["A. 4 厘米", "B. 5 厘米", "C. 10 厘米"], a: "B", w: ["A", "C"] }
    ];
    const pick = randomPick(apps);
    text = `${pick.q}\n${pick.options.join('  ')}`;
    answer = pick.a;
    wrongAnswers = pick.w;
  }

  const isMultipleChoice = typeof answer === 'string';
  return { text, answer, wrongAnswers, isMultipleChoice };
}

// ============================================
//  出题 + 举手 流程
// ============================================

/**
 * 黑板出题主流程：
 * 1. 生成题目 → 2. 粉笔逐字动画 → 3. AI 举手判断 → 4. 等待玩家点名
 */
function startNewQuestion() {
  if (gameState.isBreakTime) return;

  // 满10题自动触发下课
  if (gameState.questionCount >= 10) {
    enterBreakTime();
    return;
  }

  // 清除上轮状态
  clearAllStudentStates();
  gameState.questionPhase = 'asking';

  const q = generateMathQuestion();
  gameState.currentQuestion = q;
  gameState.questionCount++;

  // 黑板逐字写入动画 + 粉笔音效
  SoundFX.chalkWrite();
  chalkText.textContent = '';
  chalkText.classList.add('chalk-writing');

  const fullText = `第${gameState.questionCount}题：${q.text}`;
  let charIndex = 0;

  const writeInterval = setInterval(() => {
    if (gameState.isPaused) return;
    
    if (charIndex < fullText.length) {
      chalkText.textContent += fullText[charIndex];
      charIndex++;
    } else {
      clearInterval(writeInterval);
      chalkText.classList.remove('chalk-writing');
      setTimeout(() => {
        if (!gameState.isPaused) triggerHandRaising();
      }, 500);
    }
  }, 80);
}

/**
 * 根据每个学生属性决定是否举手、打瞌睡等
 */
function triggerHandRaising() {
  const studentEls = document.querySelectorAll('.student');

  gameState.students.forEach((s, index) => {
    const el = studentEls[index];
    if (!el) return;

    // 判断举手概率
    const raiseChance = calculateRaiseChance(s);
    const roll = Math.random() * 100;

    if (roll < raiseChance) {
      // 举手！
      s.isRaising = true;
      s.isSleeping = false;
      showHandIcon(el);
      setStudentPose(el, 'raising');
    } else if (s.attention < 40 && Math.random() < 0.6) {
      // 注意力低 → 可能打瞌睡
      s.isSleeping = true;
      s.isRaising = false;
      showSleepIcon(el);
    } else {
      s.isRaising = false;
      s.isSleeping = false;
    }
  });

  gameState.questionPhase = 'answering';
  updateChalkboard(chalkText.textContent + '\n（请点击一位同学回答）');
}

/**
 * 计算学生举手概率
 * 设计逻辑：
 * - 学霸 + 高注意力 = 几乎 100% 举手
 * - 学渣 + 高淘气 = 有概率瞎举手凑热闹
 * - 低注意力 = 大幅降低举手概率
 */
function calculateRaiseChance(student) {
  const { tier, attention, naughty, accuracy } = student;
  let chance = 0;

  if (tier === '学霸') {
    chance = 70 + (attention / 100) * 30;      // 70-100%
  } else if (tier === '普通') {
    chance = 20 + (attention / 100) * 30;      // 20-50%
  } else {
    // 学渣：正常举手概率低，但淘气可以加概率（瞎举手）
    chance = 5 + (naughty / 100) * 35;          // 5-40%
  }

  // 注意力惩罚：注意力 < 40 时大幅降低
  if (attention < 40) {
    chance *= 0.3;
  }

  return Math.min(chance, 98);
}

// ============================================
//  学生状态 DOM 操作
// ============================================

/** 设置学生图片姿态 */
function setStudentPose(el, pose) {
  const imgContainer = el.querySelector('.student-img');
  if (!imgContainer) return;
  const imgs = imgContainer.querySelectorAll('img');
  imgs.forEach(img => img.classList.remove('active'));
  const target = imgContainer.querySelector(`.state-${pose}`);
  if (target) target.classList.add('active');

  const poseIndex = { sitting: 0, raising: 1, standing: 2 };
  el.dataset.currentState = poseIndex[pose] ?? 0;
}

/** 显示举手图标 ✋ */
function showHandIcon(el) {
  removeStatusIcons(el);
  const icon = document.createElement('div');
  icon.className = 'student-status-icon hand-icon';
  icon.textContent = '✋';
  el.appendChild(icon);
}

/** 显示睡觉图标 Zzz */
function showSleepIcon(el) {
  removeStatusIcons(el);
  const icon = document.createElement('div');
  icon.className = 'student-status-icon sleep-icon';
  icon.innerHTML = 'Z<span>z</span><span>z</span>';
  el.appendChild(icon);
}

/** 移除所有状态图标 */
function removeStatusIcons(el) {
  el.querySelectorAll('.student-status-icon').forEach(i => i.remove());
}

/** 显示语音气泡 */
function showSpeechBubble(el, text, isCorrect) {
  // 移除旧气泡
  el.querySelectorAll('.speech-bubble').forEach(b => b.remove());

  const bubble = document.createElement('div');
  bubble.className = `speech-bubble ${isCorrect ? 'bubble-correct' : isCorrect === false ? 'bubble-wrong' : 'bubble-neutral'}`;
  bubble.textContent = text;
  el.appendChild(bubble);

  // 渐入动画
  requestAnimationFrame(() => bubble.classList.add('visible'));

  // 4秒后自动消失
  setTimeout(() => {
    bubble.classList.remove('visible');
    setTimeout(() => bubble.remove(), 300);
  }, 4000);
}

/** 清除所有学生的举手/睡觉/气泡状态 */
function clearAllStudentStates() {
  const studentEls = document.querySelectorAll('.student');
  studentEls.forEach((el, index) => {
    removeStatusIcons(el);
    el.querySelectorAll('.speech-bubble').forEach(b => b.remove());
    setStudentPose(el, 'sitting');
    if (gameState.students[index]) {
      gameState.students[index].isRaising = false;
      gameState.students[index].isSleeping = false;
    }
  });
}

/** 动态更新学霸和学渣称号 */
function updateStudentTiers() {
  const scoredStudents = gameState.students.map(s => ({ student: s, score: s.accuracy + s.attention - s.naughty }));
  scoredStudents.sort((a, b) => b.score - a.score);
  scoredStudents.forEach((item, index) => {
    if (index === 0) item.student.tier = '学霸';
    else if (index === scoredStudents.length - 1) item.student.tier = '学渣';
    else item.student.tier = '普通';
  });
}

// ============================================
//  学生回答逻辑
// ============================================

/**
 * 老师点名后学生回答流程
 * @param {HTMLElement} el - 学生DOM
 * @param {Object} student - 学生数据
 */
function handleStudentAnswer(el, student) {
  if (gameState.questionPhase !== 'answering' || !gameState.currentQuestion) return;

  const q = gameState.currentQuestion;
  gameState.questionPhase = 'evaluating'; // 进入评判阶段，锁定其他操作

  // 起立动画
  SoundFX.ding();
  setStudentPose(el, 'standing');
  removeStatusIcons(el);

  // 跳跃动画
  el.classList.remove('clicked');
  void el.offsetHeight;
  el.classList.add('clicked');
  setTimeout(() => el.classList.remove('clicked'), 400);

  // 计算回答
  setTimeout(() => {
    const { text: answerText, isCorrect } = generateAnswer(student, q);

    if (isCorrect) {
      // 答对了，其余同学恍然大悟放下手
      gameState.students.forEach((s, i) => {
        if (s.id !== student.id && s.isRaising) {
          s.isRaising = false;
          const otherEl = document.querySelectorAll('.student')[i];
          if (otherEl) removeStatusIcons(otherEl);
        }
      });
    }

    showSpeechBubble(el, answerText, isCorrect);

    // 记录评判所需的临时数据
    gameState.evaluatingStudentData = student;
    gameState.evaluatingStudentEl = el;
    gameState.actualIsCorrect = isCorrect;

    // 弹出评判面板
    judgmentStatement.textContent = `${student.name} 的回答是：“${answerText}”`;
    judgmentPanel.classList.add('active');
  }, 600);
}

/**
 * 根据学生属性生成回答文本
 * 正确率计算公式：(accuracy×0.7 - naughty×0.2 + attention×0.2 + mood×0.2)，上限90%
 * @returns {{text: string, isCorrect: boolean|null}} null表示中性回答（没在听）
 */
function generateAnswer(student, question) {
  const { tier, attention, naughty, accuracy, mood, isSleeping, isRaising } = student;

  // 情况1：打瞌睡的学生被叫起来（其实这部分由丢粉笔接管，此处保留逻辑完整性）
  if (isSleeping) {
    return { text: randomPick(SLEEPY_ANSWERS), isCorrect: null };
  }

  // 情况2：没举手且注意力低
  if (!isRaising && attention < 45) {
    return { text: randomPick(SLEEPY_ANSWERS), isCorrect: null };
  }

  // 情况3：基于综合概率掷骰
  // 公式：(正确率×70% - 淘气值×20% + 注意力×20% + 心情×20%)，上限90%
  let correctChance = accuracy * 0.7 - naughty * 0.2 + attention * 0.2 + mood * 0.2;
  correctChance = Math.max(0, Math.min(90, correctChance)); // 限制在0-90%范围内
  
  const roll = Math.random() * 100;
  const isCorrect = roll < correctChance;

  // 格式化回答的函数：加入随机语气，不被对错所绑定
  const formatAnswer = (val) => {
    return Math.random() > 0.5 ? `${val}！` : `嗯……${val}？`;
  };

  if (isCorrect) {
    return { text: formatAnswer(question.answer), isCorrect: true };
  }

  // 回答错误的情况：淘气值高 → 搞笑回答；否则 → 正经错答
  if (naughty > 55 && Math.random() < 0.6) {
    return { text: randomPick(FUNNY_ANSWERS), isCorrect: false };
  }

  // 错误策略：优先从备选错误项里拿，否则给一个随机错的数字
  let wrongVal;
  if (question.wrongAnswers && question.wrongAnswers.length > 0) {
    wrongVal = randomPick(question.wrongAnswers);
  } else {
    wrongVal = question.answer + randomPick([-3, -2, -1, 1, 2, 3, 5, -5, 10, -10]);
  }
  return { text: formatAnswer(wrongVal), isCorrect: false };
}

// ============================================
//  第八步：核心结算与特效系统
// ============================================

/** 浮动文字特效 */
function spawnFloatText(el, text, color) {
  const rect = el.getBoundingClientRect();
  const floatEl = document.createElement('div');
  floatEl.className = 'float-text';
  floatEl.textContent = text;
  floatEl.style.color = color;
  // 居中在目标元素正上方
  floatEl.style.left = (rect.left + rect.width / 2) + 'px';
  floatEl.style.top = (rect.top - 20) + 'px';
  effectsContainer.appendChild(floatEl);

  setTimeout(() => floatEl.remove(), 1500);
}

/** 丢粉笔头逻辑 */
function throwChalkAt(targetEl, studentData) {
  // 找黑板位置作为发射点
  const boardRect = document.querySelector('.blackboard').getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const startX = boardRect.left + boardRect.width / 2;
  const startY = boardRect.bottom - 20; // 讲台位置

  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 3;

  const chalk = document.createElement('div');
  chalk.className = 'chalk-projectile';
  chalk.style.left = startX + 'px';
  chalk.style.top = startY + 'px';
  effectsContainer.appendChild(chalk);

  // 夸张动画抛物线！中途巨大化
  chalk.animate([
    { transform: 'translate(0, 0) rotate(0deg) scale(1)', offset: 0 },
    { transform: `translate(${(endX - startX) / 2}px, ${(endY - startY) / 2 - 150}px) rotate(1080deg) scale(8)`, offset: 0.5 },
    { transform: `translate(${endX - startX}px, ${endY - startY}px) rotate(2160deg) scale(1)`, offset: 1 }
  ], {
    duration: 500,
    easing: 'ease-in-out'
  }).onfinish = () => {
    chalk.remove();
    // 击中！
    SoundFX.pa();
    studentData.isSleeping = false;
    removeStatusIcons(targetEl);
    setStudentPose(targetEl, 'sitting');

    // 数值更新
    studentData.mood = Math.max(0, studentData.mood - 10);
    studentData.attention = Math.min(100, studentData.attention + 20);

    spawnFloatText(targetEl, '心情↓ 注意力↑', '#FF5252');
  };
}

/** 校长突发惩罚特效 */
function triggerPrincipalPunishment() {
  // 闪屏幕
  flashRedOverlay.classList.remove('flash');
  void flashRedOverlay.offsetWidth;
  flashRedOverlay.classList.add('flash');

  // 校长音效与探头
  SoundFX.punish();
  principalHead.classList.add('punish');

  setTimeout(() => {
    principalHead.classList.remove('punish');
    principalHead.style.visibility = 'hidden';
  }, 1600);

  // 扣工资
  gameState.salary -= 50;
  updateSalaryDisplay();

  // 巨大的浮动扣款文字 - 显示在血条上方
  const hpValue = document.getElementById('teacherHpValue');
  if (hpValue) {
    const rect = hpValue.getBoundingClientRect();
    const floatEl = document.createElement('div');
    floatEl.className = 'float-text';
    floatEl.style.fontSize = '28px';
    floatEl.textContent = '-￥50';
    floatEl.style.color = '#FF1744';
    floatEl.style.left = (rect.left + rect.width / 2) + 'px';
    floatEl.style.top = (rect.top - 30) + 'px';
    effectsContainer.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 1500);
  }
}

/** 发射爱心碎片特效 */
function spawnHearts(el) {
  const rect = el.getBoundingClientRect();
  for (let i = 0; i < 3; i++) {
    const heart = document.createElement('div');
    heart.className = 'heart-effect';
    heart.textContent = '❤️';
    heart.style.left = (rect.left + rect.width / 2 + (Math.random() * 40 - 20)) + 'px';
    heart.style.top = (rect.top + (Math.random() * 20 - 10)) + 'px';
    // 轻微延迟错开
    heart.style.animationDelay = (i * 0.1) + 's';
    effectsContainer.appendChild(heart);
    setTimeout(() => heart.remove(), 1500);
  }
}

// ============================================
//  课堂随机捧乱事件系统（传纸条 & 纸飞机）
// ============================================

/** 显示分心图标（被传纸条打扰时） */
function showDistractedIcon(el) {
  removeStatusIcons(el);
  const icon = document.createElement('div');
  icon.className = 'student-status-icon distracted-icon';
  icon.textContent = '💭';
  el.appendChild(icon);
  setTimeout(() => icon.remove(), 5000);
}

/**
 * 传纸条事件：从 fromIndex 向邻座传纸条
 * 老师在 3 秒内点击可以没收；否则目标学生注意力下降
 */
function triggerPassNote(fromIndex) {
  if (gameState.eventActive) return;
  const neighborIndices = STUDENT_NEIGHBORS[fromIndex] || [];
  if (neighborIndices.length === 0) return;

  const toIndex = randomPick(neighborIndices);
  const studentEls = document.querySelectorAll('.student');
  const fromEl = studentEls[fromIndex];
  const toEl = studentEls[toIndex];
  if (!fromEl || !toEl) return;

  gameState.eventActive = true;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height * 0.4;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height * 0.4;

  const note = document.createElement('div');
  note.className = 'note-projectile';
  note.textContent = '✉️';
  note.style.left = startX + 'px';
  note.style.top = startY + 'px';
  note.title = '⚡ 点击没收纸条！';
  effectsContainer.appendChild(note);

  const fromName = gameState.students[fromIndex].name;
  pushEventLog(`👀 ${fromName} 在偷传纸条！快点击拦截！`, 'important');
  showSpeechBubble(fromEl, '嘻嘻，传纸条～ 📝', null);

  let intercepted = false;
  note.addEventListener('click', (e) => {
    e.stopPropagation();
    if (intercepted) return;
    intercepted = true;
    SoundFX.caught();
    note.classList.add('note-caught');
    setTimeout(() => note.remove(), 350);
    gameState.eventActive = false;
    spawnFloatText(fromEl, '📨 纸条被没收！', '#FF5252');
    pushEventLog(`✋ 及时没收了 ${fromName} 的纸条！`, 'positive');
  });

  const anim = note.animate([
    { transform: 'translate(-50%,-50%) rotate(-5deg) scale(1)', offset: 0 },
    { transform: `translate(${(endX - startX) * 0.45}px,${(endY - startY) * 0.45 - 28}px) rotate(18deg) scale(1.3)`, offset: 0.5 },
    { transform: `translate(${endX - startX}px,${endY - startY}px) rotate(0deg) scale(1)`, offset: 1 }
  ], { duration: 6000, easing: 'ease-in-out' });

  anim.onfinish = () => {
    if (intercepted) return;
    note.remove();
    gameState.eventActive = false;
    const targetData = gameState.students[toIndex];
    if (targetData) {
      targetData.attention = Math.max(0, targetData.attention - 15);
      showDistractedIcon(toEl);
      spawnFloatText(toEl, '注意力↓', '#FF9800');
      pushEventLog(`😤 ${fromName} 成功传到了纸条！${targetData.name} 分心了...`, 'important');
    }
  };
}

/**
 * 投纸飞机事件：从 fromIndex 投向随机目标
 * 可以被老师点击没收。不没收全体心情+1注意力-1，没收全体注意力+1心情-1
 */
function triggerPaperAirplane(fromIndex) {
  if (gameState.eventActive) return;
  const studentEls = document.querySelectorAll('.student');
  const fromEl = studentEls[fromIndex];
  if (!fromEl) return;

  gameState.eventActive = true;
  SoundFX.whoosh();

  const fromRect = fromEl.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height * 0.25;

  // 随机选择目标：老师/黑板/其他同学
  const possibleTargets = [];
  const teacherEl = document.getElementById('teacher');
  const boardEl = document.querySelector('.blackboard');
  if (teacherEl) possibleTargets.push({ el: teacherEl, label: '老师' });
  if (boardEl) possibleTargets.push({ el: boardEl, label: '黑板' });
  studentEls.forEach((el, i) => {
    if (i !== fromIndex) possibleTargets.push({ el, label: gameState.students[i]?.name || `同学${i + 1}` });
  });

  const { el: targetEl, label: targetLabel } = randomPick(possibleTargets);
  const targetRect = targetEl.getBoundingClientRect();
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height * 0.3;

  const airplane = document.createElement('div');
  airplane.className = 'paper-airplane';
  airplane.textContent = '✈️';
  airplane.style.left = startX + 'px';
  airplane.style.top = startY + 'px';
  airplane.title = '⚡ 点击没收纸飞机！';
  effectsContainer.appendChild(airplane);

  const fromName = gameState.students[fromIndex].name;
  showSpeechBubble(fromEl, '看招！✈️', null);
  pushEventLog(`✈️ ${fromName} 朝${targetLabel}扔了一架纸飞机！快点击拦截！`, 'important');

  let intercepted = false;
  airplane.addEventListener('click', (e) => {
    e.stopPropagation();
    if (intercepted) return;
    intercepted = true;
    SoundFX.caught();
    airplane.classList.add('note-caught');
    setTimeout(() => airplane.remove(), 350);
    gameState.eventActive = false;

    pushEventLog(`✋ 及时没收了 ${fromName} 的纸飞机！`, 'positive');

    // 恢复全员数值变动动画
    const studentEls = document.querySelectorAll('.student');
    gameState.students.forEach((s, idx) => {
      s.attention = Math.min(100, s.attention + 1);
      s.mood = Math.max(0, s.mood - 1);
      if (studentEls[idx]) {
        spawnFloatText(studentEls[idx], '注意力+1 心情-1', '#4CAF50');
      }
    });

    setTimeout(() => {
      if (gameState.questionPhase === 'asking' || gameState.questionPhase === 'answering') {
        // 恢复黑板题目显示，防止被事件覆盖后空着
        if (gameState.currentQuestion) {
          updateChalkboard(`第${gameState.questionCount}题：${gameState.currentQuestion.text}`);
        }
      }
    }, 2500);
  });

  const dx = endX - startX;
  const dy = endY - startY;
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = dx * 0.48 + (Math.random() > 0.5 ? 35 : -35);
  const midY = dy * 0.48 - 55;

  airplane.animate([
    { transform: `translate(-50%,-50%) rotate(${angleDeg - 45}deg) scale(1.1)`, offset: 0 },
    { transform: `translate(${midX}px,${midY}px) rotate(${angleDeg}deg) scale(1.6)`, offset: 0.4 },
    { transform: `translate(${dx}px,${dy}px) rotate(${angleDeg + 30}deg) scale(0.5)`, offset: 1 }
  ], { duration: 3000, easing: 'ease-in' }).onfinish = () => {
    if (intercepted) return;
    airplane.textContent = '💥';
    airplane.style.fontSize = '28px';
    setTimeout(() => {
      airplane.remove();
      gameState.eventActive = false;
      pushEventLog(`😫 ${fromName} 的纸飞机砸中了${targetLabel}，全班起哄！`, 'important');

      // 恢复砸中时的数值变动
      const studentEls = document.querySelectorAll('.student');
      gameState.students.forEach((s, idx) => {
        s.mood = Math.min(100, s.mood + 1);
        s.attention = Math.max(0, s.attention - 1);
        if (studentEls[idx]) {
          spawnFloatText(studentEls[idx], '心情+1 注意力-1', '#FF9800');
        }
      });

      setTimeout(() => {
        if (gameState.questionPhase === 'asking' || gameState.questionPhase === 'answering') {
          if (gameState.currentQuestion) {
            updateChalkboard(`第${gameState.questionCount}题：${gameState.currentQuestion.text}`);
          }
        }
      }, 2500);
    }, 400);
  };
}

/** 启动课堂随机事件定时器（游戏开始后调用） */
function startClassroomEventTimer() {
  // 设计理由：不秒初始化冯射防止第一题前就触发事件
  setInterval(() => {
    if (gameState.eventActive) return;
    if (gameState.questionPhase === 'evaluating') return;
    if (gameState.isBreakTime) return;  // 课间不触发纸飞机、传纸条事件
    // 找出淡气值 > 30 的学生
    const candidates = gameState.students
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.naughty > 30);
    if (candidates.length === 0) return;
    // 45% 概率触发
    if (Math.random() > 0.45) return;
    const { i } = randomPick(candidates);
    if (Math.random() < 0.5) {
      triggerPassNote(i);
    } else {
      triggerPaperAirplane(i);
    }
  }, 15000);
}

/** 老师点击了评判按钮，处理结果 */
function handleJudgment(isTeacherSayCorrect) {
  if (gameState.questionPhase !== 'evaluating') return;

  judgmentPanel.classList.remove('active');
  const sData = gameState.evaluatingStudentData;
  const sEl = gameState.evaluatingStudentEl;

  // 把 null (没在听) 也当作假处理
  const actualCorrect = gameState.actualIsCorrect === true;

  // 重要：此处由于 updateChalkboard 的过滤机制，判定结果会进日志
  // 黑板上原本显示的“请点击一位同学回答”会被过滤逻辑拦截重定向
  // 但为了彻底消除黑板上的旧提示，我们在判定开始时重置题目文本
  if (gameState.currentQuestion) {
    chalkText.textContent = `第${gameState.questionCount}题：${gameState.currentQuestion.text}`;
  }

  if (actualCorrect && isTeacherSayCorrect) {
    // 情况 A：学生对，老师判对
    SoundFX.correct();
    pushEventLog(`✅ 评判完全正确！${sData.name} 答对了。`, 'positive');
    sData.mood = Math.min(100, sData.mood + 10);
    sData.accuracy = Math.min(100, sData.accuracy + 5);
    spawnHearts(sEl);
    spawnFloatText(sEl, '心情↑ 正确率↑', '#4CAF50');
  }
  else if (!actualCorrect && !isTeacherSayCorrect) {
    // 情况 B：学生错，老师指错 (知错能改)
    SoundFX.correct();
    pushEventLog(`✔️ 评判正确，指出了 ${sData.name} 的错误，并且 ${sData.name} 已理解。`, 'positive');
    sData.accuracy = Math.min(100, sData.accuracy + 2);
    sData.attention = Math.min(100, sData.attention + 5);
    spawnFloatText(sEl, '正确率↑ 注意力↑', '#2196F3');
  }
  else if (!actualCorrect && isTeacherSayCorrect) {
    // 情况 C：学生错，老师被糊弄判对了
    pushEventLog(`❌ 糟糕！${sData.name} 答错了，老师还判对了，误导了全班！`, 'important');
    sData.mood = Math.min(100, sData.mood + 5);
    spawnFloatText(sEl, '心情↑', '#FF9800');

    // 全班掉正确率
    gameState.students.forEach(s => s.accuracy = Math.max(0, s.accuracy - 3));
    triggerPrincipalPunishment();
  }
  else if (actualCorrect && !isTeacherSayCorrect) {
    // 情况 D：学生对，老师判错
    pushEventLog(`❌ 糟糕！${sData.name} 明明答对了，老师判错了，很伤心。`, 'important');
    sData.mood = Math.max(0, sData.mood - 10);
    spawnFloatText(sEl, '受到委屈 心情↓↓', '#9C27B0');

    // 全班掉正确率
    gameState.students.forEach(s => s.accuracy = Math.max(0, s.accuracy - 5));
    triggerPrincipalPunishment();
  }

  // 恢复状态并准备下一题
  gameState.evaluatingStudentData = null;
  gameState.evaluatingStudentEl = null;
  gameState.actualIsCorrect = null;

  // 动态更新学生头衔
  updateStudentTiers();

  setTimeout(() => {
    // 逻辑 A：不管对错，先把回答者姿势重置为坐下
    if (sEl) setStudentPose(sEl, 'sitting');

    if (!actualCorrect) {
      // 答错了，重新循环举手
      gameState.questionPhase = 'asking';
      triggerHandRaising();
    } else {
      // 答对了，重置为闲置状态，并显示点击出题提示
      gameState.completedQuestionCount++; // 增加已完成题目计数
      gameState.questionPhase = 'idle';
      gameState.currentQuestion = null; // 清空当前题目
      chalkText.textContent = '📝 点击黑板出下一题！';
    }
  }, 3500);
}


// ============================================
//  界面控制
// ============================================

// ============================================
//  课间活动系统
// ============================================

const AVATAR_COLORS = ['#4FC3F7', '#F48FB1', '#A5D6A7', '#FFE082', '#CE93D8', '#FFAB91'];
const AVATAR_EMOJIS = ['👦', '👧', '👧', '👦', '👦', '👧'];
const BREAK_DURATION_MS = 30000;  // 课间 30 秒

let breakCountdownInterval = null;
let breakTimeRemaining = 30;

/** 下课！触发课间模式 */
function enterBreakTime() {
  gameState.isBreakTime = true;
  gameState.eventActive = false;
  gameState.questionPhase = 'break';
  clearAllStudentStates();

  // 隐藏整个学生座位区域（包括图片、标签、浮窗等）
  document.querySelectorAll('.student').forEach(el => {
    el.style.visibility = 'hidden';
  });

  SoundFX.bell();
  showBreakMessage('下课啦！', '课间十分钟 · 自由活动 🎉', true);
  pushEventLog('🔔 叮铃铃！下课了，同学请自由活动～');

  // 初始化倒计时 UI
  breakTimeRemaining = 30;
  const breakTimerEl = document.getElementById('breakTimer');
  breakTimerEl.textContent = breakTimeRemaining;
  breakTimerEl.classList.remove('hidden');

  setTimeout(() => {
    startStudentWandering();
    // 启动 30 秒倒计时
    breakCountdownInterval = setInterval(() => {
      breakTimeRemaining--;
      breakTimerEl.textContent = breakTimeRemaining;
      if (breakTimeRemaining <= 0) {
        clearInterval(breakCountdownInterval);
        breakCountdownInterval = null;
        triggerClassBell();
      }
    }, 1000);
  }, 3000);
}

/** 倒计时结束，强行响铃，出现大按钮 */
function triggerClassBell() {
  if (!gameState.isBreakTime) return;

  // 停止学生乱跑和产生新事件
  clearInterval(gameState.breakEventTimer);
  gameState.breakAvatars.forEach(av => {
    av.vx = 0; av.vy = 0;
  });

  SoundFX.bell();
  document.getElementById('breakTimer').classList.add('hidden');
  document.getElementById('reactionPanel').classList.add('hidden');

  // 显示大按钮
  const btn = document.getElementById('btnEndBreak');
  btn.classList.remove('hidden');

  // 挂载一次性点击事件
  const onEndClick = () => {
    btn.classList.add('hidden');
    btn.removeEventListener('click', onEndClick);
    endBreakTime();
  };
  btn.addEventListener('click', onEndClick);
}

/** 上课/下课全屏提示 */
function showBreakMessage(title, subtitle, isBell) {
  const old = document.getElementById('breakOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'breakOverlay';
  overlay.className = 'break-overlay';
  overlay.innerHTML = `
    <div class="break-content">
      <div class="break-bell">${isBell ? '🔔' : '📚'}</div>
      <h2 class="break-title">${title}</h2>
      <p class="break-subtitle">${subtitle}</p>
    </div>`;
  document.querySelector('.classroom').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  setTimeout(() => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 500);
  }, 3000);
}

/** 生成学生漫游圆块并启动动画 */
function startStudentWandering() {
  if (!gameState.isBreakTime) return;
  const classroom = document.querySelector('.classroom');
  const W = classroom.offsetWidth;
  const H = classroom.offsetHeight;

  // 活动区域：教室中下部（避开黑板顶部）
  const TOP = H * 0.38;
  const BOT = H * 0.90;
  const LEFT = 30;
  const RGHT = W - 30;

  gameState.breakAvatars = [];

  gameState.students.forEach((student, i) => {
    const el = document.createElement('div');
    el.className = 'break-avatar';
    el.style.background = AVATAR_COLORS[i];
    el.innerHTML = `<span class="av-emoji">${AVATAR_EMOJIS[i]}</span><div class="av-name">${student.name}</div>`;

    const x = LEFT + Math.random() * (RGHT - LEFT);
    const y = TOP + Math.random() * (BOT - TOP);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    classroom.appendChild(el);

    const spd = 0.7 + Math.random() * 0.6;
    const ang = Math.random() * Math.PI * 2;
    gameState.breakAvatars.push({
      el, x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      studentIndex: i,
      inEvent: false,
      changeCooldown: randomInt(60, 150),
      bounds: { TOP, BOT, LEFT, RGHT }
    });
  });

  gameState.breakAnimId = requestAnimationFrame(runBreakLoop);
  gameState.breakEventTimer = setInterval(tryBreakEvent, 5000);
}

/** 课间 RAF 主循环 */
function runBreakLoop() {
  if (!gameState.isBreakTime) return;
  if (gameState.isPaused) {
    gameState.breakAnimId = requestAnimationFrame(runBreakLoop);
    return;
  }

  gameState.breakAvatars.forEach(av => {
    if (av.inEvent) return;

    av.changeCooldown--;
    if (av.changeCooldown <= 0) {
      const spd = 0.7 + Math.random() * 0.6;
      const ang = Math.random() * Math.PI * 2;
      av.vx = Math.cos(ang) * spd;
      av.vy = Math.sin(ang) * spd;
      av.changeCooldown = randomInt(60, 150);
    }

    av.x += av.vx;
    av.y += av.vy;
    const { TOP, BOT, LEFT, RGHT } = av.bounds;
    if (av.x < LEFT + 22) { av.vx = Math.abs(av.vx); av.x = LEFT + 22; }
    if (av.x > RGHT - 22) { av.vx = -Math.abs(av.vx); av.x = RGHT - 22; }
    if (av.y < TOP + 10) { av.vy = Math.abs(av.vy); av.y = TOP + 10; }
    if (av.y > BOT - 10) { av.vy = -Math.abs(av.vy); av.y = BOT - 10; }

    av.el.style.left = av.x + 'px';
    av.el.style.top = av.y + 'px';
  });

  gameState.breakAnimId = requestAnimationFrame(runBreakLoop);
}

/** 尝试触发课间随机事件（5种） */
function tryBreakEvent() {
  if (!gameState.isBreakTime) return;
  const free = gameState.breakAvatars.filter(a => !a.inEvent);
  if (free.length === 0) return;

  const roll = Math.random();
  // 黑板涂鸦：15%
  if (roll < 0.15) { breakGraffiti(); return; }
  // 摔倒大哭：15%
  if (roll < 0.30) { breakFall(randomPick(free)); return; }
  // 以下事件需要两个同学
  if (free.length < 2) return;

  let minDist = Infinity, pair = null;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const dx = free[i].x - free[j].x;
      const dy = free[i].y - free[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) { minDist = d; pair = [free[i], free[j]]; }
    }
  }
  if (!pair || minDist > 240) return;

  if (roll < 0.52) breakArgue(pair[0], pair[1]);  // 吵架 22%
  else if (roll < 0.74) breakBump(pair[0], pair[1]);   // 推搡 22%
  else breakSnack(pair[0], pair[1]);   // 零食 26%
}

/** 课间事件 A：吵架 💢 */
function breakArgue(a, b) {
  setupFightEvent(a, b, '😤', '吵架', () => {
    return [
      makeBreakIcon(a.el, '💢', 'argue-icon'),
      makeBreakIcon(b.el, '💢', 'argue-icon')
    ];
  });
}

/** 课间事件 B：推搡 😭 */
function breakBump(a, b) {
  // 被撞学生向反方向退后一点点
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  b.x += (dx / dist) * 18;
  b.y += (dy / dist) * 18;
  b.el.style.left = b.x + 'px';
  b.el.style.top = b.y + 'px';
  b.el.classList.add('av-bumped');
  setTimeout(() => b.el.classList.remove('av-bumped'), 400);

  setupFightEvent(a, b, '💥', '推搡', () => {
    return [makeBreakIcon(b.el, '😣', 'bump-icon')];
  });
}

/** 核心打闹处理逻辑：需要狂点 3-5 次拉开，之后弹窗选择 */
function setupFightEvent(a, b, emojiPre, verb, iconSetupFn) {
  a.inEvent = b.inEvent = true;
  a.vx = a.vy = b.vx = b.vy = 0;
  SoundFX.chatter();

  const icons = iconSetupFn();
  const na = gameState.students[a.studentIndex].name;
  const nb = gameState.students[b.studentIndex].name;
  updateChalkboard(`${emojiPre} ${na} 和 ${nb} 在课间${verb}了！快连续点击他们拉架！`);

  let clicksNeeded = randomInt(3, 5);
  let resolved = false;

  // 设置点击事件
  const handleClick = (e) => {
    e.stopPropagation();
    if (resolved || !gameState.isBreakTime) return;

    SoundFX.pa();
    // 视觉震动反馈
    a.el.classList.remove('av-shake'); b.el.classList.remove('av-shake');
    void a.el.offsetWidth; void b.el.offsetWidth; // trigger reflow
    a.el.classList.add('av-shake'); b.el.classList.add('av-shake');

    clicksNeeded--;
    if (clicksNeeded <= 0) {
      resolved = true;
      a.el.removeEventListener('click', handleClick);
      b.el.removeEventListener('click', handleClick);
      a.el.style.pointerEvents = b.el.style.pointerEvents = '';

      icons.forEach(i => i.remove());
      showReactionPanel(a, b);
    }
  };

  a.el.style.pointerEvents = b.el.style.pointerEvents = 'auto';
  a.el.style.cursor = b.el.style.cursor = 'pointer';
  a.el.addEventListener('click', handleClick);
  b.el.addEventListener('click', handleClick);

  // 10秒超时未处理惩罚
  setTimeout(() => {
    if (resolved || !gameState.isBreakTime) return;
    resolved = true;
    a.el.removeEventListener('click', handleClick);
    b.el.removeEventListener('click', handleClick);
    a.el.style.pointerEvents = b.el.style.pointerEvents = '';
    icons.forEach(i => i.remove());

    gameState.students[a.studentIndex].attention = 0;
    gameState.students[b.studentIndex].attention = 0;
    updateChalkboard(`😫 老师没管，${na} 和 ${nb} 光顾着生气，注意力降到底了！`);

    a.inEvent = b.inEvent = false;
    resumeAvatar(a); resumeAvatar(b);
    setTimeout(() => { if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…'); }, 2500);
  }, 10000);
}

/** 弹出处理面板：批评或安慰 */
function showReactionPanel(a, b) {
  const panel = document.getElementById('reactionPanel');
  const btnPunish = document.getElementById('btnPunish');
  const btnComfort = document.getElementById('btnComfort');

  // 将面板定位在两名学生中间上方
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  panel.style.left = mx + 'px';
  panel.style.top = my + 'px';
  panel.classList.remove('hidden');

  updateChalkboard(`🛑 终于拉开了！你想怎么处理？`);

  const closePanel = () => {
    panel.classList.add('hidden');
    btnPunish.onpointerup = null;
    btnComfort.onpointerup = null;
    a.inEvent = b.inEvent = false;
    resumeAvatar(a); resumeAvatar(b);
    setTimeout(() => { if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…'); }, 2000);
  };

  btnPunish.onpointerup = (e) => {
    e.stopPropagation();
    const stA = gameState.students[a.studentIndex];
    const stB = gameState.students[b.studentIndex];
    stA.naughty = Math.max(0, stA.naughty - 20);
    stB.naughty = Math.max(0, stB.naughty - 20);
    stA.mood = Math.max(0, stA.mood - 10);
    stB.mood = Math.max(0, stB.mood - 10);
    spawnFloatText(a.el, '淘气↓↓', '#D32F2F');
    spawnFloatText(b.el, '淘气↓↓', '#D32F2F');
    updateChalkboard(`🤬 严厉批评了他们，淘气值下降！`);
    closePanel();
  };

  btnComfort.onpointerup = (e) => {
    e.stopPropagation();
    const stA = gameState.students[a.studentIndex];
    const stB = gameState.students[b.studentIndex];
    stA.mood = Math.min(100, stA.mood + 40);
    stB.mood = Math.min(100, stB.mood + 40);
    spawnFloatText(a.el, '心情↑↑', '#388E3C');
    spawnFloatText(b.el, '心情↑↑', '#388E3C');
    updateChalkboard(`❤️ 安慰了他们，心情大好！`);
    closePanel();
  };
}

function makeBreakIcon(parent, emoji, cls) {
  const el = document.createElement('div');
  el.className = `break-event-icon ${cls}`;
  el.textContent = emoji;
  parent.appendChild(el);
  return el;
}

function resumeAvatar(av) {
  const spd = 0.8 + Math.random() * 0.5;
  const ang = Math.random() * Math.PI * 2;
  av.vx = Math.cos(ang) * spd;
  av.vy = Math.sin(ang) * spd;
}

/** 课间事件 C：黑板涂鸦（需老师点击擦除） */
function breakGraffiti() {
  const candidates = gameState.breakAvatars.filter(av =>
    !av.inEvent && gameState.students[av.studentIndex].naughty > 15);
  const artist = randomPick(candidates.length ? candidates
    : gameState.breakAvatars.filter(a => !a.inEvent));
  if (!artist) return;

  artist.inEvent = true;
  const name = gameState.students[artist.studentIndex].name;
  updateChalkboard(`🎨 ${name} 跑去黑板涂鸦了！快点击涂鸦擦掉！`);

  const classroom = document.querySelector('.classroom');
  artist.el.style.transition = 'left 1s ease, top 1s ease';
  artist.x = classroom.offsetWidth / 2 + (Math.random() * 60 - 30);
  artist.y = classroom.offsetHeight * 0.26;
  artist.el.style.left = artist.x + 'px';
  artist.el.style.top = artist.y + 'px';

  setTimeout(() => {
    artist.el.style.transition = '';
    const graffiti = document.createElement('div');
    graffiti.className = 'break-graffiti';
    graffiti.textContent = '🎨';
    graffiti.title = '⚡ 点击擦掉涂鸦！';
    document.querySelector('.blackboard-surface').appendChild(graffiti);

    let erased = false;
    graffiti.addEventListener('click', (e) => {
      e.stopPropagation();
      if (erased) return;
      erased = true;
      graffiti.classList.add('graffiti-erased');
      setTimeout(() => graffiti.remove(), 400);
      artist.inEvent = false;
      resumeAvatar(artist);
      updateChalkboard('✨ 涂鸦擦掉了！全班注意力保住了！');
      setTimeout(() => { if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…'); }, 2000);
    });
    // 8秒未处理：全班注意力惩罚
    setTimeout(() => {
      if (erased) return;
      graffiti.remove();
      artist.inEvent = false; resumeAvatar(artist);
      gameState.students.forEach(s => s.attention = Math.max(0, s.attention - 8));
      updateChalkboard('😫 涂鸦没擦掉！下节课全班注意力下降！');
      setTimeout(() => { if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…'); }, 2500);
    }, 8000);
  }, 1200);
}

/** 课间事件 D：摔倒大哭（需老师点击安慰） */
function breakFall(av) {
  if (!av || av.inEvent) return;
  av.inEvent = true;
  av.vx = av.vy = 0;
  const name = gameState.students[av.studentIndex].name;
  updateChalkboard(`😭 ${name} 跑着跑着摔倒了！点击他安慰一下！`);

  av.el.classList.add('av-fallen');
  const cryIcon = makeBreakIcon(av.el, '😭', 'fall-cry-icon');

  av.el.style.pointerEvents = 'auto';
  av.el.style.cursor = 'pointer';

  let comforted = false;
  const onComfort = (e) => {
    e.stopPropagation();
    if (comforted) return;
    comforted = true;
    av.el.removeEventListener('click', onComfort);
    av.el.style.pointerEvents = av.el.style.cursor = '';
    av.el.classList.remove('av-fallen');
    cryIcon.remove();
    av.inEvent = false;
    gameState.students[av.studentIndex].mood = Math.min(100, gameState.students[av.studentIndex].mood + 10);
    const heartIcon = makeBreakIcon(av.el, '💗', 'comfort-icon');
    setTimeout(() => heartIcon.remove(), 2200);
    updateChalkboard(`💗 老师安慰了 ${name}，心情好多了！`);
    setTimeout(() => { resumeAvatar(av); if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…'); }, 1500);
  };
  av.el.addEventListener('click', onComfort);

  // 7秒自动恢复
  setTimeout(() => {
    if (comforted) return;
    comforted = true;
    av.el.removeEventListener('click', onComfort);
    av.el.style.pointerEvents = av.el.style.cursor = '';
    av.el.classList.remove('av-fallen');
    cryIcon.remove();
    av.inEvent = false;
    gameState.students[av.studentIndex].mood = Math.max(0, gameState.students[av.studentIndex].mood - 5);
    resumeAvatar(av);
    if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…');
  }, 7000);
}

/** 课间事件 E：分享零食（正面） */
function breakSnack(a, b) {
  a.inEvent = b.inEvent = true;
  a.vx = a.vy = b.vx = b.vy = 0;
  const iconA = makeBreakIcon(a.el, '🍬', 'snack-icon');
  const iconB = makeBreakIcon(b.el, '🍬', 'snack-icon');
  const na = gameState.students[a.studentIndex].name;
  const nb = gameState.students[b.studentIndex].name;
  pushEventLog(`🍬 ${na} 和 ${nb} 在分享零食！`, 'positive');

  setTimeout(() => {
    iconA.remove(); iconB.remove();
    gameState.students[a.studentIndex].mood = Math.min(100, gameState.students[a.studentIndex].mood + 15);
    gameState.students[b.studentIndex].mood = Math.min(100, gameState.students[b.studentIndex].mood + 15);
    // 展示心情上升飘浮文字
    spawnFloatText(a.el, '心情↑↑', '#FF9800');
    spawnFloatText(b.el, '心情↑↑', '#FF9800');
    a.inEvent = b.inEvent = false;
    resumeAvatar(a); resumeAvatar(b);
    if (gameState.questionPhase === 'break') updateChalkboard('🔔 课间自由活动中…');
  }, 4000);
}

/** 上课铃，结束课间 */
function endBreakTime() {
  if (!gameState.isBreakTime) return;
  gameState.isBreakTime = false;

  cancelAnimationFrame(gameState.breakAnimId);
  clearInterval(gameState.breakEventTimer);

  gameState.breakAvatars.forEach(a => a.el.remove());
  gameState.breakAvatars = [];

  // 显示整个学生座位区域
  document.querySelectorAll('.student').forEach(el => {
    el.style.visibility = 'visible';
  });

  // 课间休息恢复机制：学生注意力+15，心情+10
  gameState.students.forEach(s => {
    s.attention = Math.min(100, s.attention + 15);
    s.mood = Math.min(100, s.mood + 10);
  });
  pushEventLog('☕ 课间休息结束，学生们精神焕发！注意力+15，心情+10', 'positive');

  SoundFX.bell();
  showBreakMessage('上课啦！', '请同学们回到座位 📚', false);

  setTimeout(() => {
    gameState.questionPhase = 'idle';
    gameState.questionCount = 0;   // 重置计数，开始下一节课
    gameState.completedQuestionCount = 0; // 重置已完成题目计数
  }, 3500);
}

function initStartScreen() {
  // 初始化存档列表
  loadSavesList();

  // 性别选择交互
  const genderOptions = document.querySelectorAll('.gender-option');
  genderOptions.forEach(option => {
    option.addEventListener('click', () => {
      genderOptions.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  // 名字输入验证
  teacherNameInput.addEventListener('input', () => {
    if (teacherNameInput.value.trim().length > 0) {
      teacherNameInput.parentElement.classList.remove('error');
      nameError.textContent = '';
    }
  });

  // 新建游戏按钮
  if (newGameBtn) {
    newGameBtn.addEventListener('click', handleNewGame);
  }

  // 回车键快捷开始
  teacherNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNewGame();
  });

  // 绑定评判按钮
  btnJudgeCorrect.addEventListener('click', () => handleJudgment(true));
  btnJudgeWrong.addEventListener('click', () => handleJudgment(false));
}

// ============================================
//  存档系统
// ============================================

function loadSavesList() {
  if (!savesList || !noSavesTip) return;

  savesList.innerHTML = '';
  const saves = getAllSaves();

  if (saves.length === 0) {
    noSavesTip.classList.remove('hidden');
    return;
  }

  noSavesTip.classList.add('hidden');

  saves.forEach(save => {
    const card = createSaveCard(save);
    savesList.appendChild(card);
  });
}

function getAllSaves() {
  const saves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('myclass_save_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        saves.push({
          key: key,
          name: data.teacherName || '未知老师',
          gender: data.teacherGender || '男',
          salary: data.salary !== undefined ? data.salary : 10000,
          timestamp: data.timestamp || Date.now()
        });
      } catch (e) {
        console.error('存档解析失败:', key);
      }
    }
  }
  return saves.sort((a, b) => b.timestamp - a.timestamp);
}

function createSaveCard(save) {
  const card = document.createElement('div');
  card.className = 'save-card';
  card.innerHTML = `
    <div class="save-avatar">${save.gender === '女' ? '👩' : '👨'}</div>
    <div class="save-info">
      <div class="save-name">${save.name}</div>
      <div class="save-salary">工资: ￥${save.salary}</div>
    </div>
    <div class="save-actions">
      <button class="save-btn load-btn" type="button" data-key="${save.key}">读取</button>
      <button class="save-btn delete-btn" type="button" data-key="${save.key}">删除</button>
    </div>
  `;

  const loadBtn = card.querySelector('.load-btn');
  const deleteBtn = card.querySelector('.delete-btn');

  loadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleLoadSave(save.key);
  });

  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDeleteSave(save.key, save.name);
  });

  return card;
}

function handleNewGame() {
  const name = teacherNameInput.value.trim();
  const gender = document.querySelector('input[name="teacherGender"]:checked')?.value || '男';

  if (!name) {
    teacherNameInput.parentElement.classList.add('error');
    nameError.textContent = '请输入老师的名字';
    teacherNameInput.focus();
    return;
  }

  // 初始化游戏数据
  gameState.teacherName = name;
  gameState.teacherGender = gender;
  gameState.salary = 10000;
  gameState.questionCount = 0;
  gameState.completedQuestionCount = 0;
  gameState.students = generateStudents();

  // 保存到 localStorage
  saveGame();

  // 进入游戏
  enterGame();
}

function saveGame() {
  const saveKey = `myclass_save_${gameState.teacherName}`;
  const saveData = {
    teacherName: gameState.teacherName,
    teacherGender: gameState.teacherGender || '男',
    salary: gameState.salary,
    students: gameState.students,
    questionCount: gameState.questionCount,
    completedQuestionCount: gameState.completedQuestionCount,
    inventory: gameState.inventory,
    timestamp: Date.now()
  };
  localStorage.setItem(saveKey, JSON.stringify(saveData));
}

function handleLoadSave(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    if (data) {
      gameState.teacherName = data.teacherName;
      gameState.teacherGender = data.teacherGender || '男';
      gameState.salary = data.salary !== undefined ? data.salary : 10000;
      gameState.students = data.students || generateStudents();
      gameState.questionCount = data.questionCount || 0;
      gameState.completedQuestionCount = data.completedQuestionCount || 0;
      gameState.inventory = data.inventory || { megaphone: 0, ruler: 0, homework: 0, flower: 0 };
      
      enterGame();
    }
  } catch (e) {
    console.error('读取存档失败:', e);
    alert('存档数据损坏，无法读取');
  }
}

function handleDeleteSave(key, name) {
  const dialog = document.getElementById('deleteConfirmDialog');
  const cancelBtn = document.getElementById('deleteCancelBtn');
  const confirmBtn = document.getElementById('deleteConfirmBtn');
  
  if (!dialog) return;
  
  let pendingDeleteKey = key;
  
  const closeDialog = () => {
    dialog.classList.add('hidden');
    pendingDeleteKey = null;
  };
  
  const handleCancel = () => {
    closeDialog();
  };
  
  const handleConfirm = () => {
    if (pendingDeleteKey) {
      localStorage.removeItem(pendingDeleteKey);
      loadSavesList();
    }
    closeDialog();
  };
  
  cancelBtn.onclick = handleCancel;
  confirmBtn.onclick = handleConfirm;
  
  dialog.classList.remove('hidden');
}

function enterGame() {
  startScreen.classList.remove('active');
  gameScreen.classList.add('active');

  // 根据性别加载老师图片
  const teacherImg = document.getElementById('teacherImg');
  if (teacherImg) {
    if (gameState.teacherGender === '女') {
      teacherImg.src = 'assets/characters/teacher_F_standing.png';
    } else {
      teacherImg.src = 'assets/characters/teacher_standing.png';
    }
    teacherImg.alt = gameState.teacherName + '老师';
  }

  updateSalaryDisplay();
  pushEventLog(`${gameState.teacherName} 老师的课堂 — 点击黑板开始出题！`);

  applyStudentNames();
  resetStudentAnimations();

  initBlackboardClick();
  startClassroomEventTimer();
}

function applyStudentNames() {
  const studentEls = document.querySelectorAll('.student');
  studentEls.forEach((el, index) => {
    if (index < gameState.students.length) {
      const data = gameState.students[index];
      const label = el.querySelector('.student-label');
      if (label) label.textContent = data.name;
      el.dataset.name = data.name;
      el.dataset.gender = data.gender;
    }
  });
}

/** 
 * 更新黑板：用户要求仅显示题目相关文字
 * 如果是非题目文字（不含 '题'、'='、'？'），则尝试重定向到事件日志
 */
function updateChalkboard(text) {
  const isQuestion = text.includes('题') || text.includes('=') || text.includes('？') || text.includes('（');
  if (isQuestion) {
    chalkText.textContent = text;
  } else {
    // 自动重定向非题目文字到事件日志
    pushEventLog(text);
  }
}

/** 
 * 老师工资转化为血条显示在脚下
 * 假设 10000元 为 100%
 */
function updateSalaryDisplay() {
  const hpFill = document.getElementById('teacherHpFill');
  const hpValue = document.getElementById('teacherHpValue');
  
  if (hpFill) {
    const percentage = Math.max(0, Math.min(100, (gameState.salary / 10000) * 100));
    hpFill.style.width = `${percentage}%`;
    
    // 更新数值显示 - 纯数字，移除￥符号
    if (hpValue) {
      hpValue.textContent = gameState.salary;
    }

    // 随数值改变颜色
    if (percentage > 60) {
      hpFill.style.background = 'linear-gradient(180deg, #6fcf6f 0%, #4CAF50 50%, #388E3C 100%)';
    } else if (percentage > 30) {
      hpFill.style.background = 'linear-gradient(180deg, #FFD54F 0%, #FFA000 50%, #FF8F00 100%)';
    } else {
      hpFill.style.background = 'linear-gradient(180deg, #E57373 0%, #F44336 50%, #D32F2F 100%)';
    }
  }
}

/** 底部事件日志系统 */
function pushEventLog(msg, type = 'neutral') {
  const container = document.getElementById('eventLogContainer');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `event-msg ${type}`;
  msgDiv.textContent = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;

  container.appendChild(msgDiv);

  // 保持滚动到底部
  container.scrollTop = container.scrollHeight;

  // 限制条数
  if (container.children.length > 50) {
    container.removeChild(container.firstChild);
  }
}

function resetStudentAnimations() {
  document.querySelectorAll('.student').forEach((student) => {
    student.style.animation = 'none';
    void student.offsetHeight;
    student.style.animation = '';
  });
}

/** 初始化黑板为可点击出题区域 */
function initBlackboardClick() {
  const blackboard = document.querySelector('.blackboard');
  if (!blackboard) return;

  blackboard.style.cursor = 'pointer';
  blackboard.addEventListener('click', () => {
    if (gameState.questionPhase === 'idle') {
      startNewQuestion();
    }
  });
}

// ============================================
//  Tooltip 管理
// ============================================

function getStatLevel(value) {
  if (value >= 80) return { color: '#4CAF50', level: '优秀' };
  if (value >= 60) return { color: '#FF9800', level: '良好' };
  if (value >= 40) return { color: '#2196F3', level: '一般' };
  return { color: '#F44336', level: '较低' };
}

function showTooltip(studentEl, studentData) {
  hideTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'student-tooltip';
  tooltip.id = 'studentTooltip';

  const accuracyLvl = getStatLevel(studentData.accuracy);
  const naughtyLvl = getStatLevel(100 - studentData.naughty);
  const attentionLvl = getStatLevel(studentData.attention);
  const moodLvl = getStatLevel(studentData.mood);

  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="tooltip-name">${studentData.name}</span>
      <span class="tooltip-badge ${studentData.tier === '学霸' ? 'badge-top' : studentData.tier === '学渣' ? 'badge-low' : 'badge-mid'}">${studentData.tier}</span>
      <span class="tooltip-gender">${studentData.gender === '男' ? '👦' : '👧'}</span>
    </div>
    <div class="tooltip-stats">
      <div class="stat-row">
        <span class="stat-icon">📝</span>
        <span class="stat-label">正确率</span>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${studentData.accuracy}%; background:${accuracyLvl.color}"></div></div>
        <span class="stat-value">${studentData.accuracy}</span>
      </div>
      <div class="stat-row">
        <span class="stat-icon">😈</span>
        <span class="stat-label">淘气值</span>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${studentData.naughty}%; background:${naughtyLvl.color}"></div></div>
        <span class="stat-value">${studentData.naughty}</span>
      </div>
      <div class="stat-row">
        <span class="stat-icon">👀</span>
        <span class="stat-label">注意力</span>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${studentData.attention}%; background:${attentionLvl.color}"></div></div>
        <span class="stat-value">${studentData.attention}</span>
      </div>
      <div class="stat-row">
        <span class="stat-icon">😊</span>
        <span class="stat-label">心情值</span>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${studentData.mood}%; background:${moodLvl.color}"></div></div>
        <span class="stat-value">${studentData.mood}</span>
      </div>
    </div>
  `;

  studentEl.appendChild(tooltip);
  gameState.activeTooltipStudentId = studentData.id;
  requestAnimationFrame(() => tooltip.classList.add('visible'));
}

function hideTooltip() {
  const existing = document.getElementById('studentTooltip');
  if (existing) {
    existing.classList.remove('visible');
    existing.remove();
  }
  gameState.activeTooltipStudentId = null;
}

// ============================================
//  学生点击交互
// ============================================

function initStudentInteraction() {
  const studentEls = document.querySelectorAll('.student');

  studentEls.forEach((student, index) => {
    const imgContainer = student.querySelector('.student-img');
    if (imgContainer) {
      student.dataset.currentState = 0;
    }

    // 鼠标悬停显示 Tooltip
    student.addEventListener('mouseenter', () => {
      const sd = gameState.students[index];
      if (sd) showTooltip(student, sd);
    });

    student.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    // 点击 = 丢粉笔或老师点名
    student.addEventListener('click', () => {
      // 正在评判面板时不接受交互
      if (gameState.questionPhase === 'evaluating') return;

      const studentData = gameState.students[index];
      if (!studentData) return;

      // 如果学生在睡觉，丢粉笔叫醒
      if (studentData.isSleeping) {
        throwChalkAt(student, studentData);
        return;
      }

      // 否则，如果是回答阶段则走点名逻辑
      if (gameState.questionPhase === 'answering') {
        handleStudentAnswer(student, studentData);
        return;
      }

      // 如果没有在出题/回答互动阶段，点击就是随意换姿态玩
      if (imgContainer && gameState.questionPhase === 'idle') {
        const states = ['sitting', 'raising', 'standing'];
        let currentStateIdx = parseInt(student.dataset.currentState, 10);
        currentStateIdx = (currentStateIdx + 1) % states.length;
        setStudentPose(student, states[currentStateIdx]);

        const name = studentData.name;
        const gender = studentData.gender;
        let actionText = '正在回答问题...';
        const nextState = states[currentStateIdx];
        if (nextState === 'sitting') actionText = '坐下了。';
        else if (nextState === 'raising') actionText = '举手要回答问题！';
        else if (nextState === 'standing') actionText = '站起来回答问题。';
        updateChalkboard(`${name}（${gender}生）${actionText}`);

        student.classList.remove('clicked');
        void student.offsetHeight;
        student.classList.add('clicked');
        setTimeout(() => student.classList.remove('clicked'), 400);
      }
    });
  });
}

// ============================================
//  提前下课功能
// ============================================

let isEarlyDismissing = false; // 防止重复点击的锁

function initEarlyDismissBtn() {
  const btn = document.getElementById('earlyDismissBtn');
  if (!btn) return;

  btn.addEventListener('click', handleEarlyDismiss);
}

function handleEarlyDismiss() {
  const btn = document.getElementById('earlyDismissBtn');
  
  // 防止重复点击
  if (isEarlyDismissing) return;
  
  // 检查是否已经在课间
  if (gameState.isBreakTime) {
    pushEventLog('已经在课间了，别再敲铃铛啦！', 'neutral');
    return;
  }
  
  // 检查是否至少完成1道题（使用已完成题目计数）
  if (gameState.completedQuestionCount < 1) {
    pushEventLog('老师，好歹先讲一道题再下课吧！', 'neutral');
    return;
  }

  // 显示确认框
  showEarlyDismissConfirm();
}

function showEarlyDismissConfirm() {
  const remainingQuestions = 10 - gameState.questionCount;
  
  // 创建确认框
  const overlay = document.createElement('div');
  overlay.id = 'earlyDismissOverlay';
  overlay.className = 'early-dismiss-overlay';
  overlay.innerHTML = `
    <div class="early-dismiss-confirm-box">
      <div class="confirm-icon">🔔</div>
      <h3>确认提前下课？</h3>
      <p class="confirm-desc">还有 <strong>${remainingQuestions}</strong> 道题没讲完</p>
      <p class="confirm-effect">全班正确率将下降 <strong>${remainingQuestions}</strong> 点<br>但心情会提升 <strong>${remainingQuestions}</strong> 点</p>
      <div class="confirm-buttons">
        <button class="confirm-btn confirm-yes" id="btnEarlyDismissYes">确认下课</button>
        <button class="confirm-btn confirm-no" id="btnEarlyDismissNo">继续上课</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // 绑定按钮事件
  document.getElementById('btnEarlyDismissYes').addEventListener('click', () => {
    overlay.remove();
    executeEarlyDismiss();
  });
  
  document.getElementById('btnEarlyDismissNo').addEventListener('click', () => {
    overlay.remove();
  });
  
  // 点击背景关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

function executeEarlyDismiss() {
  const btn = document.getElementById('earlyDismissBtn');
  
  // 设置锁
  isEarlyDismissing = true;
  btn.classList.add('disabled');

  // 播放摇晃动画
  btn.classList.add('shake-bell');
  
  // 播放下课铃声音效
  SoundFX.bell();

  // 计算剩余题目数量
  const remainingQuestions = 10 - gameState.questionCount;

  // 全班数值结算
  gameState.students.forEach(s => {
    s.accuracy = Math.max(0, s.accuracy - remainingQuestions);
    s.mood = Math.min(100, s.mood + remainingQuestions);
  });

  // 更新学生称号
  updateStudentTiers();

  // 播报大新闻
  pushEventLog(`📢 震惊！老师提前了 ${remainingQuestions} 道题下课！全班正确率暴跌 ${remainingQuestions} 点，但大家心情大好增加了 ${remainingQuestions} 点！`, 'important');

  // 移除摇晃动画
  setTimeout(() => {
    btn.classList.remove('shake-bell');
  }, 800);

  // 强制进入课间
  setTimeout(() => {
    enterBreakTime();
    isEarlyDismissing = false;
  }, 1000);
}

// ============================================
//  商店与背包系统
// ============================================

const SHOP_ITEMS = {
  megaphone: { name: '超级大喇叭', icon: '📢', price: 500, desc: '让全班学生注意力+2' },
  ruler: { name: '无敌戒尺', icon: '📏', price: 500, desc: '让全班淘气值-2' },
  homework: { name: '课后习题', icon: '📝', price: 500, desc: '让全班正确率+2' },
  flower: { name: '无尽小红花', icon: '🌸', price: 500, desc: '让全班心情+2' }
};

function initShopAndInventory() {
  // 商店按钮
  if (shopBtn) {
    shopBtn.addEventListener('click', openShop);
  }
  
  // 背包按钮
  if (inventoryBtn) {
    inventoryBtn.addEventListener('click', openInventory);
  }
  
  // 商店关闭按钮
  const shopClose = document.getElementById('shopCloseBtn');
  if (shopClose) {
    shopClose.addEventListener('click', closeShop);
  }
  
  // 背包关闭按钮
  const inventoryClose = document.getElementById('inventoryCloseBtn');
  if (inventoryClose) {
    inventoryClose.addEventListener('click', closeInventory);
  }
  
  // 点击遮罩关闭
  if (shopPanel) {
    const backdrop = shopPanel.querySelector('.panel-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeShop);
  }
  
  if (inventoryPanel) {
    const backdrop = inventoryPanel.querySelector('.panel-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeInventory);
  }
  
  // 绑定购买按钮
  document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itemKey = e.target.dataset.item;
      buyItem(itemKey);
    });
  });
}

function pauseGame() {
  gameState.isPaused = true;
}

function resumeGame() {
  gameState.isPaused = false;
}

function openShop() {
  if (gameState.isPaused) return;
  pauseGame();
  if (shopPanel) {
    shopPanel.classList.remove('hidden');
    updateShopButtons();
  }
}

function closeShop() {
  if (shopPanel) {
    shopPanel.classList.add('hidden');
  }
  resumeGame();
}

function openInventory() {
  if (gameState.isPaused) return;
  pauseGame();
  if (inventoryPanel) {
    inventoryPanel.classList.remove('hidden');
    renderInventory();
  }
}

function closeInventory() {
  if (inventoryPanel) {
    inventoryPanel.classList.add('hidden');
  }
  resumeGame();
}

function updateShopButtons() {
  document.querySelectorAll('.buy-btn').forEach(btn => {
    const itemKey = btn.dataset.item;
    const item = SHOP_ITEMS[itemKey];
    if (item && gameState.salary >= item.price) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  });
}

function buyItem(itemKey) {
  const item = SHOP_ITEMS[itemKey];
  if (!item) return;
  
  if (gameState.salary < item.price) {
    pushEventLog('工资不够，买不起这个道具！', 'important');
    return;
  }
  
  gameState.salary -= item.price;
  gameState.inventory[itemKey]++;
  
  updateSalaryDisplay();
  updateShopButtons();
  pushEventLog(`购买了 ${item.name}！`, 'positive');
  
  // 自动保存
  saveGame();
}

function renderInventory() {
  const itemsContainer = document.getElementById('inventoryItems');
  const emptyTip = document.getElementById('inventoryEmpty');
  
  if (!itemsContainer) return;
  
  itemsContainer.innerHTML = '';
  
  const hasItems = Object.values(gameState.inventory).some(count => count > 0);
  
  if (!hasItems) {
    if (emptyTip) emptyTip.classList.remove('hidden');
    return;
  }
  
  if (emptyTip) emptyTip.classList.add('hidden');
  
  Object.entries(gameState.inventory).forEach(([key, count]) => {
    if (count > 0) {
      const item = SHOP_ITEMS[key];
      const itemEl = document.createElement('div');
      itemEl.className = 'inventory-item';
      itemEl.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
        </div>
        <div class="item-count">x${count}</div>
        <button class="use-btn" data-item="${key}">使用</button>
      `;
      
      itemEl.querySelector('.use-btn').addEventListener('click', () => useItem(key));
      itemsContainer.appendChild(itemEl);
    }
  });
}

function useItem(itemKey) {
  if (gameState.inventory[itemKey] <= 0) return;
  
  gameState.inventory[itemKey]--;
  
  switch (itemKey) {
    case 'megaphone':
      gameState.students.forEach(s => {
        s.attention = Math.min(100, s.attention + 2);
      });
      pushEventLog('📢 使用了超级大喇叭！全班注意力+2！', 'positive');
      break;
      
    case 'ruler':
      gameState.students.forEach(s => {
        s.naughty = Math.max(0, s.naughty - 2);
      });
      pushEventLog('📏 使用了无敌戒尺！全班淘气值-2！', 'positive');
      break;
      
    case 'homework':
      gameState.students.forEach(s => {
        s.accuracy = Math.min(100, s.accuracy + 2);
      });
      pushEventLog('📝 布置了课后习题！全班正确率+2！', 'positive');
      break;
      
    case 'flower':
      gameState.students.forEach(s => {
        s.mood = Math.min(100, s.mood + 2);
      });
      pushEventLog('🌸 发放了无尽小红花！全班心情+2！', 'positive');
      break;
  }
  
  updateStudentTiers();
  renderInventory();
  saveGame();
}

// --- 启动游戏 ---
document.addEventListener('DOMContentLoaded', () => {
  initStartScreen();
  initStudentInteraction();
  initEarlyDismissBtn();
  initShopAndInventory();
});
