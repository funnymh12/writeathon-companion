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
        filter: ['strong', 'b', 'em', 'i', 'a', 'p'],
        replacement: function (content) {
            return content.trim() === '' ? '' : content;
        }
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

    // 4. TRANSFORM: Convert section/div to P for Turndown
    // WeChat uses section/div for everything. Turndown treats them as blocks only if they look like blocks.
    // Converting them to P is the most reliable "brute force" fix for clumping.
    // We process bottom-up to handle nesting correctly.
    const blocks = Array.from(clone.querySelectorAll('section, div'));
    blocks.reverse().forEach(block => {
        if (block.parentNode) {
            const p = doc.createElement('p');
            p.innerHTML = block.innerHTML;
            block.parentNode.replaceChild(p, block);
        }
    });

    // 5. Extract Text via Turndown
    const turndownService = createTurndownService();
    let md = turndownService.turndown(clone.innerHTML);

    // 6. Prepend Title & Author (WeChat specific)
    const title = doc.querySelector('#activity-name')?.textContent?.trim();
    const author = doc.querySelector('#js_name')?.textContent?.trim();

    if (title) {
        let meta = `# ${title}\n\n`;
        if (author) meta += `**${author}**\n\n`;
        md = meta + md;
    }

    // 6. Post-process to ensure image separation (Defensive)
    md = md.replace(/(!\[.*?\]\(.*?\))([^\n])/g, '$1\n\n$2');

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
    // C. Gemini (gemini.google.com) - Optimized for Standard & Custom Gems
    else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
        // Focus on MAIN content to avoid Sidebar/History garbage
        const main = doc.querySelector('main');
        const root = main || doc;

        // Selectors for message blocks
        // User: .user-query-container, .query-text
        // AI: .model-response-container, message-content, .message-content, [data-test-id="model-response-text"]

        // We select specific reliable nodes (Leaf-ish nodes). 
        const blocks = root.querySelectorAll(`
            .user-query-container, 
            .model-response-container,
            message-content, 
            [data-test-id="model-response-text"],
            .user-query,
            .query-text
         `);

        // Sort by DOM order ensuring chronological conversation
        const nodes = Array.from(blocks).sort((a, b) => {
            return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        const uniqueBlocks: Element[] = [];

        // Filter Logic:
        // We want to capture the User Query and the AI Response.
        // User Query is often in .user-query or .query-text
        // AI Response is in message-content

        nodes.forEach(current => {
            // If this node contains another node in our list, SKIP this node (use the child instead)
            // Exception: specific containers that might have multiple parts? 
            // Actually, for Gemini, relying on 'message-content' is safest for AI.
            // Relying on '.query-text' or '.user-query-container' is safest for User.

            // Simple logic:
            // If it's a known leaf-type (.user-query, .query-text, message-content, data-test-id), take it.
            // If it's a container (.model-response-container, .user-query-container), only take it if it doesn't contain the known leaf-types.

            const isLeafType = current.matches('message-content, [data-test-id="model-response-text"], .query-text, .user-query');
            if (isLeafType) {
                uniqueBlocks.push(current);
            } else {
                // It's a container. Does it have a leaf-type child?
                const hasChild = current.querySelector('message-content, [data-test-id="model-response-text"], .query-text, .user-query');
                if (!hasChild) {
                    uniqueBlocks.push(current);
                }
            }
        });

        uniqueBlocks.forEach(el => {
            const html = el.outerHTML.toLowerCase();
            // Refined Role Detection
            const isUser = el.classList.contains('user-query-container') ||
                el.classList.contains('query-text') ||
                el.classList.contains('user-query') ||
                html.includes('user-query') ||
                el.closest('.user-query-container'); // Check parent too

            const text = extract(el);
            if (text.trim().length > 0) {
                conversation.push({ role: isUser ? 'User' : 'AI', text });
            }
        });
    }

    // D. Generic AI Fallback (Kimi, DeepSeek, etc.)
    if (conversation.length === 0) {
        // Look for common Chat UI patterns
        const genericBubbles = doc.querySelectorAll('[class*="message" i], [class*="bubble" i], [class*="chat-item" i]');
        genericBubbles.forEach(el => {
            // Avoid capturing the entire list if the class is on the list
            if (el.children.length > 10) return;

            const className = el.className.toLowerCase();
            const text = extract(el);
            if (text.trim().length > 10) {
                const isUser = className.includes('user') || className.includes('self') || className.includes('human');
                conversation.push({ role: isUser ? 'User' : 'AI', text });
            }
        });
    }

    // If we found a conversation structure
    if (conversation.length > 0) {
        // Filter out duplicates (often happens with querySelectorAll capturing both parent and child)
        const unique: { role: string, text: string }[] = [];
        let lastText = '';
        conversation.forEach(item => {
            if (item.text !== lastText) {
                unique.push(item);
                lastText = item.text;
            }
        });
        return unique.map(item => `**${item.role}**:\n${item.text}\n`).join('\n---\n\n');
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
        return unique.map(item => `**${item.role}**:\n${item.text}\n`).join('\n---\n\n');
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

    // 1. Strategy: WeChat (High Priority)
    if (lowerUrl.includes('mp.weixin.qq.com')) {
        const wechatMd = parseWeChat(doc);
        if (wechatMd && wechatMd.length > 50) { // Minimal validity check
            return wechatMd;
        }
    }

    // 2. Strategy: LLM Conversation
    if (lowerUrl.includes('chatgpt') || lowerUrl.includes('openai') ||
        lowerUrl.includes('gemini') || lowerUrl.includes('bard') ||
        lowerUrl.includes('doubao')) {
        const llmMd = parseLLMConversation(doc, lowerUrl);
        if (llmMd) return llmMd;
    }

    // 2.1 Strategy: DeepSeek
    if (lowerUrl.includes('deepseek')) {
        const dsMd = parseDeepSeek(doc);
        if (dsMd) return dsMd;
        // Fallback to parseLLMConversation if specific strategy fails but URL matches
        const fallback = parseLLMConversation(doc, lowerUrl);
        if (fallback) return fallback;
    }

    // 3. Fallback: General Readability
    const reader = new ReadabilityLite(doc);
    const article = reader.parse();

    // 4. General Turndown
    const turndownService = createTurndownService();
    const sourceHtml = article ? article.content : doc.body.innerHTML;

    return turndownService.turndown(sourceHtml);
};
