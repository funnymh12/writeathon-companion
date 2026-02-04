
import { describe, it, expect } from 'vitest';
import { parseContent } from './content-parser';

describe('Content Parser', () => {
    
    it('should parse basic HTML content', async () => {
        const html = `
            <html>
                <body>
                    <article>
                        <h1>Hello World</h1>
                        <p>This is a <strong>test</strong>.</p>
                    </article>
                </body>
            </html>
        `;
        const result = await parseContent(html, 'https://example.com');
        // Readability might extract H1 as title or part of content depending on scoring.
        // Turndown converts H1 to # 
        // We just ensure the content is there.
        expect(result).toContain('Hello World');
        expect(result).toContain('This is a **test**.');
    });

    it('should handle WeChat articles', async () => {
        const html = `
            <html>
                <body>
                    <div id="activity-name">Test Article</div>
                    <div id="js_name">Author Name</div>
                    <div id="js_content">
                        <section>
                            <p>Paragraph 1</p>
                        </section>
                        <p>Paragraph 2</p>
                    </div>
                </body>
            </html>
        `;
        const result = await parseContent(html, 'https://mp.weixin.qq.com/s/test');
        expect(result).toContain('# Test Article');
        expect(result).toContain('**Author Name**');
        expect(result).toContain('Paragraph 1');
        expect(result).toContain('Paragraph 2');
    });

    it('should handle DeepSeek chat logs with thinking process', async () => {
        const html = `
            <html>
                <body>
                    <div class="ds-chat-message">
                        <div class="ds-avatar-user">User</div>
                        <div class="content">What is 1+1?</div>
                    </div>
                    <div class="ds-chat-message">
                        <div class="ds-thinking">Thinking process...</div>
                        <div class="content">The answer is 2.</div>
                    </div>
                </body>
            </html>
        `;
        // Mocking DOMParser for Vitest/JSDOM
        // Note: content-parser uses DOMParser internally which JSDOM supports.
        
        // However, complex selectors might be tricky if the HTML structure isn't exactly matching the parser's expectation.
        // Let's try to match the parser's selector logic.
        // DeepSeek parser looks for [class*="chat-message"] or [data-testid="chat_message"]
        // And specific internal classes.
        
        const deepSeekHtml = `
            <div class="chat-message">
                <div class="ds-avatar-user"></div>
                <div>What is 1+1?</div>
            </div>
            <div class="chat-message">
                <div class="ds-thinking">Thinking about math...</div>
                <div>The answer is 2.</div>
            </div>
        `;

        const result = await parseContent(deepSeekHtml, 'https://chat.deepseek.com/chat/123');
        
        expect(result).toContain('**User**:');
        expect(result).toContain('What is 1+1?');
        expect(result).toContain('**AI**:');
        expect(result).toContain('> **[深度思考]**');
        expect(result).toContain('Thinking about math...');
        expect(result).toContain('The answer is 2.');
    });

    it('should handle DeepSeek fallback (no thinking)', async () => {
        const deepSeekHtml = `
            <div class="chat-message">
                <div class="ds-avatar-user">User</div>
                <div>Hi</div>
            </div>
            <div class="chat-message">
                <div>Hello there</div>
            </div>
        `;

        const result = await parseContent(deepSeekHtml, 'https://chat.deepseek.com/chat/123');
        
        expect(result).toContain('**User**:');
        expect(result).toContain('Hi');
        expect(result).toContain('**AI**:');
        expect(result).toContain('Hello there');
        expect(result).not.toContain('**[深度思考]**');
    });

    it('should fallback to readability for generic sites', async () => {
        const html = `
            <html>
                <body>
                    <nav>Menu</nav>
                    <article>
                        <h1>Main Content</h1>
                        <p>This is the main article.</p>
                    </article>
                    <footer>Footer</footer>
                </body>
            </html>
        `;
        const result = await parseContent(html, 'https://example.com/article');
        expect(result).toContain('Main Content');
        expect(result).toContain('This is the main article.');
        expect(result).not.toContain('Menu');
        expect(result).not.toContain('Footer');
    });
});
