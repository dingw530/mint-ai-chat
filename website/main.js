const translations = {
  zh: {
    navCapabilities: '能力', navPrinciples: '方法', navOpenSource: '开源', github: 'GitHub ↗', heroEyebrow: '开源 AI 工作台', heroTitle: '让想法<br /><em>开始行动。</em>', heroLede: 'Mint 把对话、知识和工具放进同一个安静而有力量的空间。少一点切换，多一点真正完成。', heroPrimary: '在 GitHub 查看', heroSecondary: '探索能力', artCaption: '对话 · 知识 · 行动', showcaseLabel: '真实界面', showcaseTitle: '熟悉的界面，<em>更大的空间。</em>', showcaseBody: '从对话开始，在同一个清爽的工作台里继续前进。这里就是 Mint 的真实界面。', shotOverview: '一个安静的工作台', shotSidebar: '清晰的入口和上下文', shotChat: '把问题聊到下一步', manifestoLabel: '为什么是 Mint', manifestoTitle: '工具应该<br /><strong>懂你的工作。</strong>', manifestoBody: '不是又一个聊天窗口。Mint 是一个可以积累上下文、连接知识、调用工具的工作空间。它让 AI 从“回答一个问题”，走向“陪你把事情做完”。', statOne: '保持上下文', statTwo: '连接你的知识', statThree: '实际完成工作', capabilitiesLabel: '核心能力', capabilitiesTitle: '一个空间，<em>三种力量。</em>', capabilitiesAside: '从灵感到交付，保持思路连贯。', cardOneTitle: '自然对话', cardOneBody: '支持多模型的流畅对话，把问题聊清楚，也把下一步聊出来。', cardTwoTitle: '活的知识库', cardTwoBody: '让文档、想法和经验彼此连接。你的上下文，值得被记住。', cardThreeTitle: '真正去行动', cardThreeBody: '通过工具和 Agent，把“应该做什么”变成“已经做完了什么”。', openSourceLabel: '开放构建', openSourceTitle: '你的工作台，<br /><em>由你定义。</em>', openSourceBody: 'Mint 开源、可扩展，也愿意听见你的想法。来看看它如何工作，或者一起让它变得更好。', openSourceButton: '打开仓库', footerTagline: '让想法开始行动。', footerMade: 'Made for meaningful work.'
  },
  en: {
    navCapabilities: 'Capabilities', navPrinciples: 'Approach', navOpenSource: 'Open source', github: 'GitHub ↗', heroEyebrow: 'Open-source AI workspace', heroTitle: 'Move ideas<br /><em>into action.</em>', heroLede: 'Mint brings conversation, knowledge, and tools into one calm, capable workspace. Less switching. More done.', heroPrimary: 'View on GitHub', heroSecondary: 'Explore capabilities', artCaption: 'Conversation · Knowledge · Action', showcaseLabel: 'The real interface', showcaseTitle: 'A familiar interface, <em>more room to think.</em>', showcaseBody: 'Start with a conversation and keep moving inside one clear workspace. This is Mint, as it is.', shotOverview: 'A calm workspace', shotSidebar: 'Clear entry points and context', shotChat: 'Take the question to its next step', manifestoLabel: 'Why Mint', manifestoTitle: 'Tools should<br /><strong>understand your work.</strong>', manifestoBody: 'Not another chat window. Mint is a workspace that accumulates context, connects knowledge, and calls tools. It moves AI from answering one question to helping you finish the work.', statOne: 'Keep the context', statTwo: 'Connect your knowledge', statThree: 'Get the work done', capabilitiesLabel: 'Core capabilities', capabilitiesTitle: 'One space, <em>three forces.</em>', capabilitiesAside: 'Keep the thread from first spark to final handoff.', cardOneTitle: 'Natural conversation', cardOneBody: 'Fluid conversations across models that clarify the question and reveal the next step.', cardTwoTitle: 'Living knowledge', cardTwoBody: 'Connect documents, ideas, and experience. Your context deserves to be remembered.', cardThreeTitle: 'Real action', cardThreeBody: 'Turn “what should I do?” into “what have I finished?” with tools and Agents.', openSourceLabel: 'Build in the open', openSourceTitle: 'Your workspace,<br /><em>your definition.</em>', openSourceBody: 'Mint is open, extensible, and ready for your ideas. See how it works, or help make it better.', openSourceButton: 'Open repository', footerTagline: 'Move ideas into action.', footerMade: 'Made for meaningful work.'
  }
};

Object.assign(translations.zh, {
  navCapabilities: '技术架构',
  navPrinciples: '产品架构',
  heroEyebrow: 'LLM Wiki 实现 · 开源知识工作台',
  heroTitle: '让知识成为<br /><em>AI 的上下文。</em>',
  heroLede: 'Mint 是一个以 LLM Wiki 知识库为核心、以 Chat 为承载的开源 AI 系统：先把知识编译成上下文，再让对话、Agent 和工具在正确的信息上工作。',
  heroPrimary: '探索 LLM Wiki',
  heroSecondary: '查看知识信号',
  showcaseLabel: 'LLM Wiki 实现',
  showcaseTitle: '不是文档堆，<em>是活的知识系统。</em>',
  showcaseBody: 'Mint 将 Wiki、知识图谱、热度信号和 Agent 工作流连接起来，让团队知道什么被看见、什么值得更新、下一步该做什么。',
  shotWiki: 'LLM Wiki：让知识持续产生信号',
  shotOverview: '从对话进入知识',
  shotSidebar: '清晰的知识入口',
  shotChat: '把上下文聊到下一步',
  manifestoLabel: '产品架构',
  manifestoTitle: 'LLM Wiki 是核心，<br /><strong>Chat 是承载。</strong>',
  manifestoBody: 'Mint 的产品分工很清晰：LLM Wiki 负责积累、组织和编译知识；Chat 提供最低摩擦的交互入口；Agent 和 Tools 则把上下文带进真实任务。',
  statOne: '知识库：积累与编译',
  statTwo: 'Chat：上下文交互',
  statThree: 'Agent：执行与回写',
  capabilitiesLabel: '技术架构',
  capabilitiesTitle: '从文档到上下文，<em>每层都有职责。</em>',
  capabilitiesAside: '知识库负责积累和编译，Chat 负责把它带入工作。',
  flowSource: '知识来源',
  flowWiki: 'LLM Wiki 编译层',
  flowContext: '上下文检索',
  flowSurface: 'Chat / Agent / Tools',
  cardOneTitle: '知识入口层',
  cardOneBody: '接入 Wiki 文档、文件和外部知识，把分散信息变成可管理的来源。',
  cardTwoTitle: 'LLM Wiki 核心层',
  cardTwoBody: '编译结构、关系和生命周期，提供可检索、可追踪的上下文。',
  cardThreeTitle: '承载与执行层',
  cardThreeBody: 'Chat 承载交互，Agent 和 Tools 消费 Wiki 上下文并执行下一步。',
  openSourceLabel: '开源的 LLM Wiki',
  openSourceTitle: '把知识留下，<br /><em>让智能接着发生。</em>',
  openSourceBody: 'Mint 正在实现一个属于你的 LLM Wiki：开放、可扩展，并且和真实工作流连接在一起。',
  footerTagline: '让知识真正可用。'
});

Object.assign(translations.en, {
  navCapabilities: 'Technical architecture',
  navPrinciples: 'Product architecture',
  heroEyebrow: 'LLM Wiki implementation · Open knowledge workspace',
  heroTitle: 'Make knowledge<br /><em>AI context.</em>',
  heroLede: 'Mint is an open AI system with an LLM Wiki knowledge base at its core and Chat as its surface: compile knowledge into context, then let conversations, Agents, and tools work on the right information.',
  heroPrimary: 'Explore LLM Wiki',
  heroSecondary: 'See knowledge signals',
  showcaseLabel: 'LLM Wiki implementation',
  showcaseTitle: 'Not a document pile, <em>a living knowledge system.</em>',
  showcaseBody: 'Mint connects Wiki, knowledge graphs, usage signals, and Agent workflows — so teams can see what is useful, what needs care, and what should happen next.',
  shotWiki: 'LLM Wiki: knowledge that keeps producing signal',
  shotOverview: 'Move from conversation to knowledge',
  shotSidebar: 'Clear knowledge entry points',
  shotChat: 'Carry context into the next step',
  manifestoLabel: 'Product architecture',
  manifestoTitle: 'LLM Wiki is the core,<br /><strong>Chat is the surface.</strong>',
  manifestoBody: 'Mint has a clear product split: the LLM Wiki accumulates, organizes, and compiles knowledge; Chat is the lowest-friction interaction surface; Agents and Tools carry that context into real work.',
  statOne: 'Wiki: accumulate and compile',
  statTwo: 'Chat: interact with context',
  statThree: 'Agents: execute and write back',
  capabilitiesLabel: 'Technical architecture',
  capabilitiesTitle: 'From documents to context, <em>every layer has a job.</em>',
  capabilitiesAside: 'The Wiki accumulates and compiles; Chat brings it into the work.',
  flowSource: 'Knowledge sources',
  flowWiki: 'LLM Wiki compiler',
  flowContext: 'Context retrieval',
  flowSurface: 'Chat / Agent / Tools',
  cardOneTitle: 'Knowledge intake',
  cardOneBody: 'Bring in Wiki pages, files, and external knowledge as managed sources for the system.',
  cardTwoTitle: 'LLM Wiki core',
  cardTwoBody: 'Compile structure, relationships, and lifecycle into searchable, traceable context.',
  cardThreeTitle: 'Surface and execution',
  cardThreeBody: 'Chat carries the interaction while Agents and Tools consume Wiki context and act.',
  openSourceLabel: 'Open-source LLM Wiki',
  openSourceTitle: 'Keep the knowledge,<br /><em>keep intelligence moving.</em>',
  openSourceBody: 'Mint is an LLM Wiki implementation for your work: open, extensible, and connected to real workflows.',
  footerTagline: 'Make knowledge genuinely useful.'
});

const toggle = document.querySelector('.language-toggle');
const setLanguage = (language) => {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('is-english', language === 'en');
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const value = translations[language][element.dataset.i18n];
    if (value) element.innerHTML = value;
  });
  toggle.setAttribute('aria-pressed', String(language === 'en'));
  localStorage.setItem('mint-site-language', language);
};

const savedLanguage = localStorage.getItem('mint-site-language');
setLanguage(savedLanguage === 'en' ? 'en' : 'zh');
toggle.addEventListener('click', () => setLanguage(document.documentElement.lang === 'zh-CN' ? 'en' : 'zh'));
document.querySelector('#year').textContent = new Date().getFullYear();
