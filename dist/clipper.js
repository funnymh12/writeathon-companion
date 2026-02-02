(function () {
  /**
   * Writeathon Clipper Logic
   * Includes simplified Readability and HTML-to-Markdown conversion
   * Enhanced for AI conversation pages (Doubao, ChatGPT, Claude, etc.)
   */

  class Clipper {
    constructor() {
      this.doc = document;
      this.clone = null;

      // AI 对话页面特征检测规则
      this.aiConversationPatterns = [
        { host: 'doubao.com', selector: '.conversation-content, .message-content, [class*="message"], [class*="chat"]' },
        { host: 'chat.openai.com', selector: '[data-message-author-role], .markdown, .prose' },
        { host: 'chatgpt.com', selector: '[data-message-author-role], .markdown, .prose' },
        { host: 'claude.ai', selector: '[class*="Message"], [class*="message-content"]' },
        { host: 'kimi.moonshot.cn', selector: '[class*="message"], [class*="chat"]' },
        { host: 'tongyi.aliyun.com', selector: '[class*="message"], [class*="chat"]' },
        { host: 'yiyan.baidu.com', selector: '[class*="message"], [class*="chat"]' },
        { host: 'gemini.google.com', selector: '[class*="message"], .response-content' },
        { host: 'poe.com', selector: '[class*="Message"], [class*="chat"]' },
      ];
    }

    getArticle(options = {}) {
      this.options = { includeImages: true, ...options };
      try {
        // 检测是否为 AI 对话页面
        const isAIConversation = this._detectAIConversation();

        if (isAIConversation) {
          return this._extractAIConversation();
        }

        // 普通页面提取逻辑
        return this._extractNormalPage();
      } catch (err) {
        console.error('[Writeathon Clipper] Error:', err);
        return {
          title: document.title,
          content: '',
          error: err.toString(),
          stats: { words: 0, images: 0, links: 0 }
        };
      }
    }

    // 检测是否为 AI 对话页面
    _detectAIConversation() {
      const hostname = window.location.hostname;

      // 检查已知的 AI 对话网站
      for (const pattern of this.aiConversationPatterns) {
        if (hostname.includes(pattern.host)) {
          return pattern;
        }
      }

      // 通用检测：查找对话式布局特征
      const conversationIndicators = [
        '[class*="conversation"]',
        '[class*="chat-message"]',
        '[class*="message-list"]',
        '[data-role="user"]',
        '[data-role="assistant"]',
        '[class*="user-message"]',
        '[class*="assistant-message"]',
        '[class*="ai-response"]'
      ];

      for (const selector of conversationIndicators) {
        if (document.querySelector(selector)) {
          return { host: 'generic', selector: selector };
        }
      }

      return null;
    }

    // 提取 AI 对话内容
    _extractAIConversation() {
      console.log('[Writeathon Clipper] Detected AI conversation page');

      const metadata = this._getMetadata();
      let markdown = '';

      // 查找所有消息元素
      const messageSelectors = [
        // 通用选择器
        '[class*="message"]:not([class*="message-input"]):not([class*="message-box"])',
        '[class*="Message"]:not([class*="Input"])',
        '[data-message-author-role]',
        '.prose',
        '.markdown',
        // 豆包特定
        '[class*="chat-message"]',
        '[class*="conversation-turn"]'
      ];

      let messages = [];
      for (const selector of messageSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          messages = Array.from(found);
          break;
        }
      }

      if (messages.length === 0) {
        // 回退到普通提取
        console.log('[Writeathon Clipper] No conversation messages found, falling back to normal extraction');
        return this._extractNormalPage();
      }

      // 处理每条消息
      messages.forEach((msg, index) => {
        // 跳过输入框相关元素
        if (this._isInputElement(msg)) return;

        // 克隆并清理消息
        const clonedMsg = msg.cloneNode(true);
        this._cleanConversationMessage(clonedMsg);

        // 判断角色
        const role = this._detectMessageRole(msg);
        const roleLabel = role === 'user' ? '👤 **用户**' : '🤖 **AI**';

        // 转换为 Markdown
        const content = this._toMarkdown(clonedMsg).trim();
        if (content.length > 0) {
          markdown += `\n${roleLabel}\n\n${content}\n\n---\n`;
        }
      });

      const stats = {
        words: markdown.replace(/\s+/g, '').length,
        images: (markdown.match(/!\[/g) || []).length,
        links: (markdown.match(/\]\(/g) || []).length
      };

      return {
        title: metadata.title || document.title,
        url: document.location.href,
        content: markdown.trim(),
        stats: stats,
        excerpt: metadata.excerpt
      };
    }

    // 检测是否为输入相关元素
    _isInputElement(el) {
      const className = el.className?.toString().toLowerCase() || '';
      const inputPatterns = ['input', 'textarea', 'editor', 'send', 'submit', 'toolbar', 'footer'];
      return inputPatterns.some(p => className.includes(p)) ||
        el.querySelector('textarea, input[type="text"]') !== null;
    }

    // 检测消息角色
    _detectMessageRole(el) {
      const className = el.className?.toString().toLowerCase() || '';
      const dataRole = el.getAttribute('data-message-author-role') ||
        el.getAttribute('data-role') || '';

      if (dataRole === 'user' || className.includes('user') || className.includes('human')) {
        return 'user';
      }
      return 'assistant';
    }

    // 清理对话消息中的杂项
    _cleanConversationMessage(node) {
      // 移除按钮、工具栏等
      const junkSelectors = [
        'button',
        '[class*="button"]',
        '[class*="toolbar"]',
        '[class*="action"]',
        '[class*="share"]',
        '[class*="copy"]',
        '[class*="like"]',
        '[class*="dislike"]',
        '[class*="feedback"]',
        '[class*="vote"]',
        '[class*="tool"]',
        '[class*="menu"]',
        '[class*="dropdown"]',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="tooltip"]',
        '[class*="avatar"]',
        '[class*="icon"]:not(img)',
        '[class*="reference"]',
        '[class*="source"]',
        '[class*="citation"]',
        'svg',
        '[role="button"]',
        '[aria-label*="复制"]',
        '[aria-label*="分享"]',
        '[aria-label*="点赞"]',
        '[title*="复制"]',
        '[title*="分享"]'
      ];

      junkSelectors.forEach(selector => {
        try {
          node.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) { }
      });

      // 移除包含特定文字的短元素
      this._removeJunkTextElements(node);
    }

    // 移除包含杂项文字的元素
    _removeJunkTextElements(node) {
      const junkTexts = [
        '分享', '复制', '点赞', '踩', '收藏', '举报', '反馈',
        '参考.*篇资料', '深度思考', '技能', '发消息', '选择技能',
        '复制代码', 'Copy', 'Share', 'Like', 'Dislike',
        '重新生成', '继续', '停止', 'Stop', 'Regenerate',
        '编辑', 'Edit', '删除', 'Delete'
      ];

      const pattern = new RegExp(`^(${junkTexts.join('|')})$`, 'i');

      const walk = (el) => {
        if (el.nodeType !== Node.ELEMENT_NODE) return;

        const text = el.textContent?.trim() || '';
        // 只对短文本元素应用规则
        if (text.length < 30 && pattern.test(text)) {
          el.remove();
          return;
        }

        Array.from(el.children).forEach(walk);
      };

      Array.from(node.children).forEach(walk);
    }

    // 普通页面提取
    _extractNormalPage() {
      // Work on a clone to avoid modifying the actual page
      this.clone = this.doc.body.cloneNode(true);

      // 1. Prepare
      this._preProcess(this.clone);

      // 2. Identify Metadata
      const metadata = this._getMetadata();

      // 3. Find Main Content
      let contentNode = this._findMainContent(this.clone);
      if (!contentNode) contentNode = this.clone;

      // 4. Post-Process Content
      this._postProcess(contentNode);

      // 5. Convert to Markdown
      const markdown = this._toMarkdown(contentNode);

      // 6. Stats
      const stats = this._getStats(contentNode, markdown);

      return {
        title: metadata.title || this.doc.title,
        url: this.doc.location.href,
        content: markdown,
        stats: stats,
        excerpt: metadata.excerpt
      };
    }


    _getMetadata() {
      const title =
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('h1')?.textContent ||
        document.title;

      const excerpt =
        document.querySelector('meta[name="description"]')?.content ||
        document.querySelector('meta[property="og:description"]')?.content ||
        '';

      return { title: title.trim(), excerpt: excerpt.trim() };
    }

    _preProcess(root) {
      // Remove scripts, styles, and unlikely candidates
      const junkTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'form', 'nav', 'footer', 'aside'];
      root.querySelectorAll(junkTags.join(',')).forEach(el => el.remove());

      // Remove hidden elements
      root.querySelectorAll('*').forEach(el => {
        if (el.style && el.style.display === 'none') el.remove();
        if (el.getAttribute('hidden') !== null) el.remove();
        if (el.getAttribute('aria-hidden') === 'true') el.remove();
      });
    }

    _findMainContent(root) {
      // 1. Look for 'article' tag
      const article = root.querySelector('article');
      if (article) return article;

      // 2. Look for role='main'
      const main = root.querySelector('[role="main"], main');
      if (main) return main;

      // 3. Score paragraphs to find the best parent
      const paragraphs = Array.from(root.querySelectorAll('p'));
      if (paragraphs.length === 0) return root;

      const scores = new Map();
      let maxScore = 0;
      let bestCandidate = null;

      paragraphs.forEach(p => {
        const text = p.textContent.trim();
        if (text.length < 25) return;

        let parent = p.parentElement;
        let score = text.length;

        // Weigh up the DOM tree (up to 3 levels)
        let level = 1;
        while (parent && parent !== root && level <= 3) {
          const currentScore = scores.get(parent) || 0;
          // Decay score by level distance
          const newScore = currentScore + (score / level);
          scores.set(parent, newScore);

          if (newScore > maxScore) {
            maxScore = newScore;
            bestCandidate = parent;
          }

          parent = parent.parentElement;
          level++;
        }
      });

      return bestCandidate;
    }

    _postProcess(node) {
      // Clean up the chosen node
      const stripClasses = [
        'share', 'comment', 'related', 'ads', 'promo', 'login', 'signup', 'newsletter', 'toc', 'sidebar',
        'copyright', 'author-info', 'recommend', 'social', 'tool', 'qrcode', 'meta', 'footer', 'header',
        'nav', 'menu', 'breadcrumbs', 'subscribe',
        // AI 对话界面相关
        'action', 'toolbar', 'button', 'icon', 'avatar', 'feedback', 'vote', 'like', 'dislike',
        'copy-button', 'share-button', 'reference', 'citation', 'source-list', 'tooltip'
      ];

      const junkTextPatterns = [
        // 常见网页 UI
        /回到顶部/, /扫码下载/, /原链接/, /免责声明/, /版权所有/, /阅读原文/,
        /相关推荐/, /热门文章/, /关注我们/, /下载APP/, /广告/, /推广/,
        // AI 对话界面 UI
        /^分享$/, /^复制$/, /^点赞$/, /^踩$/, /^收藏$/, /^举报$/, /^反馈$/,
        /^深度思考$/, /^技能$/, /^发消息$/, /^选择技能$/,
        /参考\s*\d+\s*篇资料/, /参考资料/, /引用来源/,
        /^复制代码$/, /^Copy$/, /^Share$/, /^Like$/, /^Dislike$/,
        /^重新生成$/, /^继续$/, /^停止$/, /^Stop$/, /^Regenerate$/,
        /^编辑$/, /^Edit$/, /^删除$/, /^Delete$/,
        /这是啥意思/, /查看更多/, /展开全部/, /收起/
      ];

      // Remove elements with these classes/ids
      const traverse = (el) => {
        if (el.nodeType !== Node.ELEMENT_NODE) return;

        // 1. Check ID/Class blacklist
        const id = el.id.toLowerCase();
        const cls = el.className.toString().toLowerCase();
        const isJunkClass = stripClasses.some(token => id.includes(token) || cls.includes(token));

        if (isJunkClass) {
          el.remove();
          return;
        }

        // 2. Check Text Content blacklist (for small blocks)
        if (el.innerText && el.innerText.length < 50) {
          const text = el.innerText.trim();
          if (junkTextPatterns.some(pattern => pattern.test(text))) {
            el.remove();
            return;
          }
        }

        // 3. Remove Link-Heavy Clusters (like footer navs)
        // If an element has many links and little text, kill it.
        if (el.tagName === 'DIV' || el.tagName === 'UL' || el.tagName === 'SECTION') {
          const linkCount = el.querySelectorAll('a').length;
          const textLength = el.innerText.length;
          // Heuristic: >3 links and link density high
          if (linkCount > 3 && (linkCount * 20) > textLength) { // 20 chars per link avg
            el.remove();
            return;
          }
        }

        Array.from(el.children).forEach(traverse);
      };

      Array.from(node.children).forEach(traverse);
    }

    _toMarkdown(node) {
      if (!node) return '';
      let out = '';

      const children = Array.from(node.childNodes);

      children.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.textContent.replace(/[\n\t]+/g, ' ').replace(/\s+/g, ' ');
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;

        const tag = child.tagName.toLowerCase();
        let content = this._toMarkdown(child);

        switch (tag) {
          case 'h1': out += `\n# ${content}\n\n`; break;
          case 'h2': out += `\n## ${content}\n\n`; break;
          case 'h3': out += `\n### ${content}\n\n`; break;
          case 'h4': out += `\n#### ${content}\n\n`; break;
          case 'h5': out += `\n##### ${content}\n\n`; break;
          case 'h6': out += `\n###### ${content}\n\n`; break;
          case 'p': out += `\n${content.trim()}\n\n`; break;
          case 'br': out += '  \n'; break;
          case 'hr': out += '\n---\n'; break;
          case 'ul': out += `\n${this._processList(child, '-')}\n`; break;
          case 'ol': out += `\n${this._processList(child, '1.')}\n`; break;
          case 'li': out += `- ${content.trim()}\n`; break; // Fallback
          case 'blockquote': out += `\n> ${content.trim().replace(/\n/g, '\n> ')}\n\n`; break;
          case 'code': out += ` \`${content}\` `; break;
          case 'pre':
            // Try to get language
            const codeLang = child.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || '';
            out += `\n\`\`\`${codeLang}\n${child.textContent.trim()}\n\`\`\`\n\n`;
            break;
          case 'strong':
          case 'b': out += ` **${content.trim()}** `; break;
          case 'em':
          case 'i': out += ` *${content.trim()}* `; break;
          case 'a':
            let href = child.getAttribute('href');
            if (href && !href.startsWith('javascript:')) {
              if (href && !href.startsWith('http') && !href.startsWith('data:') && !href.startsWith('#')) {
                try { href = new URL(href, document.baseURI).href; } catch (e) { }
              }
              out += ` [${content.trim()}](${href}) `;
            }
            else out += ` ${content} `;
            break;
          case 'img':
            if (this.options.includeImages) {
              let src = child.getAttribute('src') || child.getAttribute('data-src');
              const alt = child.getAttribute('alt') || '';
              if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                try { src = new URL(src, document.baseURI).href; } catch (e) { }
              }
              if (src && !src.startsWith('data:')) out += `\n![${alt}](${src})\n`;
            }
            break;
          case 'div':
          case 'section':
          case 'article':
            out += `\n${content}\n`;
            break;
          default:
            out += content;
        }
      });

      // Clean up multiple newlines
      return out.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    }

    _processList(listNode, marker) {
      let out = '';
      Array.from(listNode.children).forEach((li, index) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const prefix = marker === '1.' ? `${index + 1}.` : '-';
        out += `${prefix} ${this._toMarkdown(li).trim()}\n`;
      });
      return out;
    }

    _getStats(node, markdown) {
      const words = markdown.replace(/\s+/g, '').length;
      return {
        words: words,
        images: node.querySelectorAll('img').length,
        links: node.querySelectorAll('a').length
      };
    }
  }

  // Assign to global
  window.writeathonClipper = new Clipper();
  console.log('[Writeathon] Clipper loaded');
})();
