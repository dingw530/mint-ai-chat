const translations = {
  zh: {
    navCapabilities: '能力', navPrinciples: '方法', navOpenSource: '开源', github: 'GitHub ↗', heroEyebrow: '开源 AI 工作台', heroTitle: '让想法<br /><em>开始行动。</em>', heroLede: 'Mint 把对话、知识和工具放进同一个安静而有力量的空间。少一点切换，多一点真正完成。', heroPrimary: '在 GitHub 查看', heroSecondary: '探索能力', artCaption: '对话 · 知识 · 行动', showcaseLabel: '真实界面', showcaseTitle: '熟悉的界面，<em>更大的空间。</em>', showcaseBody: '从对话开始，在同一个清爽的工作台里继续前进。这里就是 Mint 的真实界面。', shotOverview: '一个安静的工作台', shotSidebar: '清晰的入口和上下文', shotChat: '把问题聊到下一步', manifestoLabel: '为什么是 Mint', manifestoTitle: '工具应该<br /><strong>懂你的工作。</strong>', manifestoBody: '不是又一个聊天窗口。Mint 是一个可以积累上下文、连接知识、调用工具的工作空间。它让 AI 从“回答一个问题”，走向“陪你把事情做完”。', statOne: '保持上下文', statTwo: '连接你的知识', statThree: '实际完成工作', capabilitiesLabel: '核心能力', capabilitiesTitle: '一个空间，<em>三种力量。</em>', capabilitiesAside: '从灵感到交付，保持思路连贯。', cardOneTitle: '自然对话', cardOneBody: '支持多模型的流畅对话，把问题聊清楚，也把下一步聊出来。', cardTwoTitle: '活的知识库', cardTwoBody: '让文档、想法和经验彼此连接。你的上下文，值得被记住。', cardThreeTitle: '真正去行动', cardThreeBody: '通过工具和 Agent，把“应该做什么”变成“已经做完了什么”。', openSourceLabel: '开放构建', openSourceTitle: '你的工作台，<br /><em>由你定义。</em>', openSourceBody: 'Mint 开源、可扩展，也愿意听见你的想法。来看看它如何工作，或者一起让它变得更好。', openSourceButton: '打开仓库', footerTagline: '让想法开始行动。', footerMade: 'Made for meaningful work.'
  },
  en: {
    navCapabilities: 'Capabilities', navPrinciples: 'Approach', navOpenSource: 'Open source', github: 'GitHub ↗', heroEyebrow: 'Open-source AI workspace', heroTitle: 'Move ideas<br /><em>into action.</em>', heroLede: 'Mint brings conversation, knowledge, and tools into one calm, capable workspace. Less switching. More done.', heroPrimary: 'View on GitHub', heroSecondary: 'Explore capabilities', artCaption: 'Conversation · Knowledge · Action', showcaseLabel: 'The real interface', showcaseTitle: 'A familiar interface, <em>more room to think.</em>', showcaseBody: 'Start with a conversation and keep moving inside one clear workspace. This is Mint, as it is.', shotOverview: 'A calm workspace', shotSidebar: 'Clear entry points and context', shotChat: 'Take the question to its next step', manifestoLabel: 'Why Mint', manifestoTitle: 'Tools should<br /><strong>understand your work.</strong>', manifestoBody: 'Not another chat window. Mint is a workspace that accumulates context, connects knowledge, and calls tools. It moves AI from answering one question to helping you finish the work.', statOne: 'Keep the context', statTwo: 'Connect your knowledge', statThree: 'Get the work done', capabilitiesLabel: 'Core capabilities', capabilitiesTitle: 'One space, <em>three forces.</em>', capabilitiesAside: 'Keep the thread from first spark to final handoff.', cardOneTitle: 'Natural conversation', cardOneBody: 'Fluid conversations across models that clarify the question and reveal the next step.', cardTwoTitle: 'Living knowledge', cardTwoBody: 'Connect documents, ideas, and experience. Your context deserves to be remembered.', cardThreeTitle: 'Real action', cardThreeBody: 'Turn “what should I do?” into “what have I finished?” with tools and Agents.', openSourceLabel: 'Build in the open', openSourceTitle: 'Your workspace,<br /><em>your definition.</em>', openSourceBody: 'Mint is open, extensible, and ready for your ideas. See how it works, or help make it better.', openSourceButton: 'Open repository', footerTagline: 'Move ideas into action.', footerMade: 'Made for meaningful work.'
  }
};

Object.assign(translations.zh, {
  heroEyebrow: 'LLM Wiki 实现 · 开源知识工作台',
  heroTitle: '让知识<br /><em>真正可用。</em>',
  heroLede: 'Mint 是一个面向 LLM 的 Wiki 实现：把文档变成可检索、可追踪、会持续生长的知识系统，让 Agent 真正拥有上下文。',
  heroPrimary: '探索 LLM Wiki',
  heroSecondary: '查看知识信号',
  showcaseLabel: 'LLM Wiki 实现',
  showcaseTitle: '不是文档堆，<em>是活的知识系统。</em>',
  showcaseBody: 'Mint 将 Wiki、知识图谱、热度信号和 Agent 工作流连接起来，让团队知道什么被看见、什么值得更新、下一步该做什么。',
  shotWiki: 'LLM Wiki：让知识持续产生信号',
  shotOverview: '从对话进入知识',
  shotSidebar: '清晰的知识入口',
  shotChat: '把上下文聊到下一步',
  manifestoLabel: 'LLM Wiki 的核心',
  manifestoTitle: '让 AI<br /><strong>记得你的世界。</strong>',
  manifestoBody: 'LLM Wiki 不只是把 Markdown 放进一个目录。Mint 为知识建立结构、关联和反馈信号，让模型能找到正确的上下文，也让人能看见知识正在如何被使用。',
  statOne: '编译可用上下文',
  statTwo: '追踪知识生命周期',
  statThree: '驱动 Agent 协作',
  capabilitiesLabel: 'Wiki 能力',
  capabilitiesTitle: '知识进入系统，<em>工作开始流动。</em>',
  capabilitiesAside: '从原始文档到可行动的上下文，每一步都可见。',
  cardOneTitle: '知识编译',
  cardOneBody: '把分散文档整理成模型能理解、能检索、能引用的上下文层。',
  cardTwoTitle: '知识信号',
  cardTwoBody: '通过热度、访问和生命周期状态，找到真正值得维护的内容。',
  cardThreeTitle: 'Agent 协作',
  cardThreeBody: '让 Agent 读取 Wiki、调用工具，并把新的理解沉淀回知识系统。',
  openSourceLabel: '开源的 LLM Wiki',
  openSourceTitle: '把知识留下，<br /><em>让智能接着发生。</em>',
  openSourceBody: 'Mint 正在实现一个属于你的 LLM Wiki：开放、可扩展，并且和真实工作流连接在一起。',
  footerTagline: '让知识真正可用。'
});

Object.assign(translations.en, {
  heroEyebrow: 'LLM Wiki implementation · Open knowledge workspace',
  heroTitle: 'Make knowledge<br /><em>genuinely useful.</em>',
  heroLede: 'Mint is an LLM Wiki implementation: turning documents into a searchable, traceable, living knowledge system that gives Agents real context.',
  heroPrimary: 'Explore LLM Wiki',
  heroSecondary: 'See knowledge signals',
  showcaseLabel: 'LLM Wiki implementation',
  showcaseTitle: 'Not a document pile, <em>a living knowledge system.</em>',
  showcaseBody: 'Mint connects Wiki, knowledge graphs, usage signals, and Agent workflows — so teams can see what is useful, what needs care, and what should happen next.',
  shotWiki: 'LLM Wiki: knowledge that keeps producing signal',
  shotOverview: 'Move from conversation to knowledge',
  shotSidebar: 'Clear knowledge entry points',
  shotChat: 'Carry context into the next step',
  manifestoLabel: 'The LLM Wiki core',
  manifestoTitle: 'Let AI<br /><strong>remember your world.</strong>',
  manifestoBody: 'An LLM Wiki is more than putting Markdown in a folder. Mint gives knowledge structure, relationships, and feedback signals — so models find the right context and people see how knowledge is being used.',
  statOne: 'Compile usable context',
  statTwo: 'Track the knowledge lifecycle',
  statThree: 'Power Agent collaboration',
  capabilitiesLabel: 'Wiki capabilities',
  capabilitiesTitle: 'When knowledge enters the system, <em>work starts to flow.</em>',
  capabilitiesAside: 'From raw documents to actionable context, every step stays visible.',
  cardOneTitle: 'Knowledge compilation',
  cardOneBody: 'Turn scattered documents into context that models can understand, retrieve, and cite.',
  cardTwoTitle: 'Knowledge signals',
  cardTwoBody: 'Use heat, access, and lifecycle status to find what is truly worth maintaining.',
  cardThreeTitle: 'Agent collaboration',
  cardThreeBody: 'Let Agents read the Wiki, call tools, and feed new understanding back into the system.',
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
