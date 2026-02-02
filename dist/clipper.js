(function () {
  /**
   * Writeathon Clipper Logic
   * Includes simplified Readability and HTML-to-Markdown conversion
   */

  class Clipper {
    constructor() {
      this.doc = document;
      this.clone = null;
    }

    getArticle(options = {}) {
      this.options = { includeImages: true, ...options };
      try {
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
        'nav', 'menu', 'breadcrumbs', 'subscribe'
      ];

      const junkTextPatterns = [
        /回到顶部/, /扫码下载/, /原链接/, /免责声明/, /版权所有/, /阅读原文/,
        /相关推荐/, /热门文章/, /关注我们/, /下载APP/, /广告/, /推广/
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
