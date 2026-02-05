import { ReadabilityLite } from './readability-lite';
import TurndownService from 'turndown';

// Standard Turndown Service Factory
const createTurndownService = () => {
    const service = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*'
    });

    service.addRule('removeEmpty', {
        filter: function (node) {
            return ['STRONG', 'B', 'EM', 'I', 'A', 'P'].includes(node.nodeName) && node.textContent?.trim() === '';
        },
        replacement: () => ''
    });

    service.addRule('removeScripts', {
        filter: ['script', 'style', 'noscript', 'iframe', 'button', 'input', 'form', 'svg'] as any,
        replacement: () => ''
    });

    // Keep images but ensure they are on their own lines
    service.addRule('images', {
        filter: 'img',
        replacement: function (content, node) {
            const el = node as HTMLElement;
            const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original');
            if (!src || src.startsWith('data:')) return '';
            const alt = el.getAttribute('alt') || '';
            // Force images to be block-level with newlines
            return `\n\n![${alt}](${src})\n\n`;
        }
    });

    // Handle block-level containers that aren't semantic P tags (common in WeChat)
    service.addRule('blockContainers', {
        filter: ['section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        replacement: function (content, node) {
            const trimmed = content.trim();
            if (trimmed.length > 0) {
                // Ensure double newlines for separation
                return '\n\n' + trimmed + '\n\n';
            }
            return '';
        }
    });

    // Explicitly handle line breaks
    service.addRule('lineBreaks', {
        filter: 'br',
        replacement: () => '\n'
    });

    return service;
};

// ----------------------------------------------------------------------------
// Strategy: WeChat Official Account
// ----------------------------------------------------------------------------
const parseWeChat = (doc: Document): string | null => {
    // 1. Target the main content container specifically
    const content = doc.querySelector('#js_content');
    if (!content) return null;

    // 2. Clone to avoid mutating original
    const clone = content.cloneNode(true) as HTMLElement;

    // 3. Surgical cleaning for WeChat
    const trash = [
        '#js_sponsor_ad_area',
        '.reward_area',
        '.js_click_ad',
        '.rich_media_tool',
        '#js_pc_qr_code',
        'script', 'style', 'iframe', 'noscript', 'button'
    ];
    trash.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 3.1 Style Normalization Structure Enhancement (CRITICAL STEP)
    // Convert inline styles to semantic tags BEFORE structural transformation
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
        const style = window.getComputedStyle(el); // Note: getComputedStyle might not work on detached clone in some envs, but inline style parsing works
        const inlineStyle = el.getAttribute('style') || '';

        // Handle Bold
        if (inlineStyle.includes('font-weight: bold') || inlineStyle.includes('font-weight: 700') ||
            inlineStyle.includes('font-weight: 600') || inlineStyle.includes('font-weight:800') ||
            inlineStyle.includes('font-weight:900')) {
            const strong = doc.createElement('strong');
            strong.innerHTML = el.innerHTML;
            el.replaceWith(strong);
        }
    });

    // 4. TRANSFORM: Convert section/div to P for Turndown
    const blocks = Array.from(clone.querySelectorAll('section, div'));
    blocks.reverse().forEach(block => {
        if (block.parentNode) {
            // Heuristic: If this block is short, bold, and seemingly a header, make it H3
            const text = block.textContent?.trim() || '';
            const isBold = block.querySelector('strong, b') || block.getAttribute('style')?.includes('font-weight: bold');

            if (isBold && text.length > 0 && text.length < 50 && !text.includes('\n')) {
                const h3 = doc.createElement('h3');
                h3.innerHTML = block.innerHTML;
                block.parentNode.replaceChild(h3, block);
            } else {
                const p = doc.createElement('p');
                p.innerHTML = block.innerHTML;
                block.parentNode.replaceChild(p, block);
            }
        }
    });

    // 5. Extract Text via Turndown
    const turndownService = createTurndownService();
    // Keep H3s we just made
    turndownService.keep(['h3', 'h4', 'strong', 'b']);

    let md = turndownService.turndown(clone.innerHTML);

    // 6. Prepend Title & Author (WeChat specific)
    const title = doc.querySelector('#activity-name')?.textContent?.trim() ||
        doc.querySelector('.rich_media_title')?.textContent?.trim();
    const author = doc.querySelector('#js_name')?.textContent?.trim() ||
        doc.querySelector('.rich_media_meta_text')?.textContent?.trim();

    if (title) {
        let meta = `# ${title}\n\n`;
        if (author) meta += `**Author: ${author}**\n\n---\n\n`;
        md = meta + md;
    }

    // 7. Post-process to clean up excessive newlines sometimes caused by structural replacement
    md = md.replace(/\n{3,}/g, '\n\n');

    return enhanceMarkdownSyntax(md);
};

// ----------------------------------------------------------------------------
// Strategy: Syntax Enhancer (Post-Processing)
// ----------------------------------------------------------------------------
const enhanceMarkdownSyntax = (text: string): string => {
    let md = text;

    // 1. Unordered List Repair
    // Converts "• Text", "● Text" to "- Text"
    md = md.replace(/^(\s*)[•●]\s+/gm, '$1- ');

    // 2. Ordered List Repair
    // Converts "1、Text", "1.Text" (no space), "1．Text" (fullwidth dot) to "1. Text"
    md = md.replace(/^(\s*)(\d+)[、．.]\s*/gm, '$1$2. ');
    // Handle (1) Text -> 1. Text pattern (Optional, usually desirable for consistency)
    // md = md.replace(/^(\s*)\((\d+)\)\s*/gm, '$1$2. ');

    // 3. Bold Formatting Cleanup
    // 3.1 Remove spaces inside bold: "** Text **" -> "**Text**"
    md = md.replace(/\*\*\s+([^*]*?)\s+\*\*/g, '**$1**');

    // 3.2 Move common punctuation OUTSIDE of bold (Chinese typography optimization)
    // "**Text，**" -> "**Text**，"
    // "**Text。**" -> "**Text**。"
    const punctuation = '，。；：！？、,.!:;?';
    // Use a regex that captures the content and the trailing punctuation
    // Note: We perform this iteratively or via refined regex.
    // Simplifying to common cases:
    md = md.replace(new RegExp(`\\*\\*([^\\*]+)([${punctuation}])\\*\\*`, 'g'), '**$1**$2');

    // 4. Spacing (Pangu-like) - Optional but nice
    // Add space between Text and **Bold**
    // Text**Bold** -> Text **Bold**
    // **Bold**Text -> **Bold** Text
    // md = md.replace(/([\u4e00-\u9fa5a-zA-Z0-9])\*\*/g, '$1 **');
    // md = md.replace(/\*\*([\u4e00-\u9fa5a-zA-Z0-9])/g, '** $1');

    // 5. Cleanup Empty/Useless Elements
    // Empty links: []() or [ ]()
    md = md.replace(/\[\s*\]\(.*?\)/g, '');
    // Empty bold/italic
    md = md.replace(/\*\*\s*\*\*/g, '');

    // 6. Ensure Image Separation (Defensive)
    // Ensures images have newlines around them so they render as blocks
    md = md.replace(/([^\n])(\!\[.*?\]\(.*?\))/g, '$1\n\n$2');
    md = md.replace(/(\!\[.*?\]\(.*?\))([^\n])/g, '$1\n\n$2');

    return md;
};

// ----------------------------------------------------------------------------
// Strategy: LLM / Chat Interfaces
// ----------------------------------------------------------------------------
const parseLLMConversation = (doc: Document, url: string): string | null => {
    let conversation: { role: string, text: string }[] = [];

    // Helper to extract text from a node using Turndown for consistent formatting
    const turndownService = createTurndownService();
    const extract = (el: Element | null) => {
        if (!el) return '';
        // Remove "Regenerate" buttons and artifacts often found in LLM bubbles
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('button, .sr-only, .aria-label').forEach(b => b.remove());
        return turndownService.turndown(clone.innerHTML);
    };

    // A. ChatGPT (chatgpt.com)
    if (url.includes('chatgpt.com') || url.includes('openai.com')) {
        // Look for turns. 
        // Strategy: [data-message-author-role]
        const turns = doc.querySelectorAll('[data-message-author-role]');
        if (turns.length > 0) {
            turns.forEach(turn => {
                const role = turn.getAttribute('data-message-author-role') || 'Unknown';
                const text = extract(turn); // Sometimes the content is inside a nested div, but turndown handles semantic HTML well.
                if (text.trim()) conversation.push({ role: role === 'user' ? 'User' : 'AI', text });
            });
        } else {
            // Fallback: article tags often used in ChatGPT DOM
            doc.querySelectorAll('article').forEach((article, idx) => {
                // Heuristic: Odd is User, Even is AI (or vice versa? Usually User starts)
                // Actually ChatGPT uses specific test-ids now.
                const role = article.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role')
                    || (idx % 2 === 0 ? 'User' : 'AI');
                const text = extract(article);
                if (text.trim()) conversation.push({ role: role === 'user' ? 'User' : 'AI', text });
            });
        }
    }

    // B. Doubao (doubao.com) - Using more reliable selectors
    else if (url.includes('doubao.com')) {
        const chatItems = doc.querySelectorAll('div[class*="chat-item"], div[class*="message-container"], [data-testid*="message"]');
        chatItems.forEach(item => {
            const className = item.className.toLowerCase();
            const html = item.innerHTML.toLowerCase();
            const isUser = className.includes('user') || html.includes('user-avatar') || html.includes('用户头像');

            if (isUser) {
                const text = extract(item);
                if (text.trim()) conversation.push({ role: 'User', text });
            } else {
                // AI Response Turn: Might contain Thinking + Answer

                // Strategy: Subtraction. 
                // 1. Find Thought Block
                const thoughtEl = item.querySelector('[class*="thought"], [class*="thinking"]');
                let thoughtText = '';

                // Clone the item to manipulate it for Answer extraction without destroying original
                const itemClone = item.cloneNode(true) as HTMLElement;

                if (thoughtEl) {
                    // Extract thought text from the specific element
                    const tClone = thoughtEl.cloneNode(true) as HTMLElement;
                    tClone.querySelectorAll('[class*="header"], [class*="title"], button').forEach(el => el.remove());
                    thoughtText = extract(tClone);

                    // Remove thought element from itemClone to isolate the Answer
                    const thoughtInClone = itemClone.querySelector('[class*="thought"], [class*="thinking"]');
                    if (thoughtInClone) thoughtInClone.remove();
                }

                // 2. Extract Answer (What's left in the clone)
                // Remove other separate artifacts like actions, buttons
                itemClone.querySelectorAll('button, [class*="action"], [class*="footer"]').forEach(el => el.remove());
                const answerText = extract(itemClone);

                // If we found a distinct thought block, add it as a quote
                if (thoughtText.trim()) {
                    conversation.push({
                        role: 'AI',
                        text: `> **[思考过程]**\n> \n> ${thoughtText.replace(/\n/g, '\n> ')}`
                    });
                }

                // Add the formal answer
                if (answerText.trim() && answerText !== thoughtText) {
                    conversation.push({ role: 'AI', text: answerText });
                }
            }
        });

        // Fallback for Doubao: if no bubbles found, try looking for alternating high-level containers
        if (conversation.length === 0) {
            const possibleBubbles = doc.querySelectorAll('main div > div > div');
            possibleBubbles.forEach(div => {
                if (div.textContent && div.textContent.length > 20) {
                    // Heuristic: If it has classes like 'msg', 'bubble', 'content'
                    if (/msg|bubble|content|chat/i.test(div.className)) {
                        const text = extract(div);
                        if (text.trim()) conversation.push({ role: 'Content', text });
                    }
                }
            });
        }
    }

    // C. Gemini (gemini.google.com)
    // Optimized for latest Gemini Web Interface (Feb 2026)
    else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
        const root = doc.querySelector('main') || doc.body;

        // Gemini Structure Analysis:
        // User Query: .user-query-container, .query-text, .ms-user-query
        // Model Response: .model-response-container, message-content, .ms-model-response
        // We look for high-level "turn" containers if possible, or leaf nodes in order.

        // Strategy: Select all potential message blocks and sort by position
        const blocks = root.querySelectorAll(`
            .user-query-container,
            .model-response-container,
            message-content,
            [data-test-id="model-response-text"],
            .query-text
        `);

        // Filter and Deduplicate
        // We only want the "meat". If we select a container, we check if we also selected its children.
        // If we have children, we prefer children (as they are more specific).
        // BUT for Gemini, <message-content> is the best AI container. .user-query-container is the best User container.

        const conversationNodes: { role: string, node: Element }[] = [];

        blocks.forEach(block => {
            // Determine Role
            const isUser = block.classList.contains('user-query-container') ||
                block.classList.contains('query-text') ||
                block.querySelector('.user-query-container');

            const isAI = block.tagName.toLowerCase() === 'message-content' ||
                block.classList.contains('model-response-container') ||
                block.getAttribute('data-test-id') === 'model-response-text';

            if (isUser) {
                // If it's a container, try to find the text part, otherwise take the whole
                const textPart = block.querySelector('.query-text') || block;
                conversationNodes.push({ role: 'User', node: textPart });
            } else if (isAI) {
                // For AI, message-content is usually pure.
                conversationNodes.push({ role: 'AI', node: block });
            }
        });

        // Sort by document position
        conversationNodes.sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

        // Extract Text
        conversationNodes.forEach(item => {
            // Clean specific Gemini UI garbage
            const clone = item.node.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('.edit-button, .response-feedback, .more-options, .citation, .sources-list').forEach(el => el.remove());

            const text = extract(clone);
            if (text.trim().length > 0) {
                conversation.push({ role: item.role, text });
            }
        });
    }

    // D. Generic AI Fallback (Kimi, DeepSeek, etc.)
    if (conversation.length === 0) {
        // Look for common Chat UI patterns
        const genericBubbles = doc.querySelectorAll('[class*="message" i], [class*="bubble" i], [class*="chat-item" i]');
        genericBubbles.forEach(el => {
            if (el.children.length > 10) return; // Skip likely containers
            const className = el.className.toLowerCase();
            const text = extract(el);
            if (text.trim().length > 5) {
                const isUser = className.includes('user') || className.includes('self') || className.includes('human');
                conversation.push({ role: isUser ? 'User' : 'AI', text });
            }
        });
    }

    // Format Output
    if (conversation.length > 0) {
        // Deduplicate adjacent
        const unique: { role: string, text: string }[] = [];
        let lastText = '';
        conversation.forEach(item => {
            if (item.text !== lastText) {
                unique.push(item);
                lastText = item.text;
            }
        });

        // Add Metadata Header
        const dateStr = new Date().toLocaleString('zh-CN', { hour12: false });
        let result = `> 📅 **Clipping Date**: ${dateStr}\n> 🔗 **Source**: [${url}](${url})\n\n---\n\n`;

        result += unique.map(item => {
            const roleHeader = item.role === 'User' ? '#### 🙋 User' : '#### 🤖 AI';
            return `${roleHeader}\n\n${item.text}`;
        }).join('\n\n---\n\n');

        return result;
    }

    return null;
};

// ----------------------------------------------------------------------------
// Strategy: DeepSeek (chat.deepseek.com)
// ----------------------------------------------------------------------------
const parseDeepSeek = (doc: Document): string | null => {
    let conversation: { role: string, text: string }[] = [];

    // Helper to extract text
    const turndownService = createTurndownService();
    const extract = (el: Element | null) => {
        if (!el) return '';
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('button, .sr-only, .aria-label, .ds-icon').forEach(b => b.remove());
        return turndownService.turndown(clone.innerHTML);
    };

    // Selectors based on observations (Generic fallbacks included)
    // DeepSeek typical structure: 
    // User: [class*="chat-input"], [class*="user-message"]
    // AI: [class*="assistant-message"]
    // Thinking: [class*="thinking-process"], or distinctive styling

    // We iterate through all message blocks
    const messages = doc.querySelectorAll('[class*="fe-5c548f"], [class*="chat-message"], [data-testid="chat_message"]'); // "fe-5c548f" is a hash often seen, but we use fuzzy match

    // If no specific classes found, try a broader search for the chat list container
    const chatList = doc.querySelector('[class*="chat_list"], [class*="message_list"]') || doc.body;
    const blocks = chatList.querySelectorAll('div > div'); // Rough approximation of turns

    if (messages.length > 0) {
        messages.forEach(msg => {
            const html = msg.innerHTML.toLowerCase();
            const text = extract(msg);
            if (!text.trim()) return;

            // Role detection
            const isUser = html.includes('avatar-user') || msg.className.includes('user') || msg.querySelector('.ds-avatar-user');

            if (isUser) {
                conversation.push({ role: 'User', text });
            } else {
                // AI Turn - Inspect for Thinking Process
                // DeepSeek often puts thinking in a separate collapsible or distinctive block

                // 1. Try to find thinking block
                const thinkingEl = msg.querySelector('.ds-thinking, [class*="thinking"]');
                let thinkText = '';

                // Clone for clean answer extraction
                const clone = msg.cloneNode(true) as HTMLElement;

                if (thinkingEl) {
                    const tClone = thinkingEl.cloneNode(true) as HTMLElement;
                    thinkText = extract(tClone);

                    // Remove thinking from main clone
                    const thinkInClone = clone.querySelector('.ds-thinking, [class*="thinking"]');
                    thinkInClone?.remove();
                }

                // 2. Extract Answer
                const answerText = extract(clone);

                // 3. Format
                if (thinkText.trim()) {
                    conversation.push({
                        role: 'AI',
                        text: `> **[深度思考]**\n> \n> ${thinkText.replace(/\n/g, '\n> ')}`
                    });
                }

                if (answerText.trim()) {
                    conversation.push({ role: 'AI', text: answerText });
                }
            }
        });
    } else {
        // Fallback: Generic "Ds" classes often used in DeepSeek
        const potentialTurns = doc.querySelectorAll('.ds-markdown, .ds-user-message');
        potentialTurns.forEach(turn => {
            const isUser = turn.className.includes('user');
            const text = extract(turn);
            if (text) conversation.push({ role: isUser ? 'User' : 'AI', text });
        });
    }


    if (conversation.length > 0) {
        // Deduplicate
        const unique: { role: string, text: string }[] = [];
        let last = '';
        conversation.forEach(item => {
            if (item.text !== last && item.text.length > 2) {
                unique.push(item);
                last = item.text;
            }
        });
        return enhanceMarkdownSyntax(unique.map(item => `**${item.role}**:\n${item.text}\n`).join('\n---\n\n'));
    }

    return null;
};

// ----------------------------------------------------------------------------
// Main Parser Entry Point
// ----------------------------------------------------------------------------
export const parseContent = async (html: string, url: string): Promise<string> => {
    if (!html) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 0. Safety Check
    if (!doc || !doc.body) {
        throw new Error('Invalid HTML content');
    }

    const lowerUrl = url.toLowerCase();
    let resultMarkdown = '';

    // 1. Strategy: WeChat (High Priority)
    if (lowerUrl.includes('mp.weixin.qq.com')) {
        const wechatMd = parseWeChat(doc);
        if (wechatMd && wechatMd.length > 50) {
            resultMarkdown = wechatMd;
        }
    }

    // 2. Strategy: LLM Conversation
    else if (lowerUrl.includes('chatgpt') || lowerUrl.includes('openai') ||
        lowerUrl.includes('gemini') || lowerUrl.includes('bard') ||
        lowerUrl.includes('doubao')) {
        const llmMd = parseLLMConversation(doc, lowerUrl);
        if (llmMd) resultMarkdown = llmMd;
    }

    // 2.1 Strategy: DeepSeek
    else if (lowerUrl.includes('deepseek')) {
        const dsMd = parseDeepSeek(doc);
        if (dsMd) {
            resultMarkdown = dsMd;
        } else {
            // Fallback
            const fallback = parseLLMConversation(doc, lowerUrl);
            if (fallback) resultMarkdown = fallback;
        }
    }

    // 3. Fallback: General Readability - Only if no specific strategy worked
    if (!resultMarkdown) {
        const reader = new ReadabilityLite(doc);
        const article = reader.parse();
        const turndownService = createTurndownService();
        const sourceHtml = article ? article.content : doc.body.innerHTML;
        resultMarkdown = turndownService.turndown(sourceHtml);
    }

    // Final Polish: Apply global syntax enhancements
    return enhanceMarkdownSyntax(resultMarkdown);
};
