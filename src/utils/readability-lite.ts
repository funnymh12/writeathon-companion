
/**
 * A standalone, lightweight implementation of Readability logic.
 * Adapted for Writeathon Clipper to function without heavy dependencies.
 */

export interface Article {
    title: string;
    content: string; // HTML string
    textContent: string;
    excerpt: string;
}

export class ReadabilityLite {
    private doc: Document;
    private articleTitle: string;

    // Reject elements with these class/id patterns
    private REGEXPS = {
        unlikelyCandidates: /-ad-|ai-search|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|foot|header|html-widget|legends|menu|modal|nav|popup|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
        okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,
        positive: /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i,
        negative: /hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget|weixin-qr|author-info|reward|qrcode|copyright/i,
        divToPElements: /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
    };

    constructor(doc: Document) {
        this.doc = doc;
        this.articleTitle = this.getArticleTitle();
    }

    public parse(): Article | null {
        this.prepDocument();

        const candidate = this.grabArticle();
        if (!candidate) return null;

        return {
            title: this.articleTitle,
            content: candidate.innerHTML,
            textContent: candidate.textContent || '',
            excerpt: this.getExcerpt(candidate)
        };
    }

    private getArticleTitle(): string {
        // Simple title extraction
        const ogTitle = this.doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
        if (ogTitle) return ogTitle;
        const h1 = this.doc.querySelector('h1');
        if (h1) return h1.textContent || '';
        return this.doc.title;
    }

    private prepDocument() {
        // Remove scripts and styles
        this.doc.querySelectorAll('script, style, noscript, svg, font').forEach(el => el.remove());

        // Remove unlikely candidates
        this.doc.querySelectorAll('*').forEach((node) => {
            const el = node as HTMLElement;
            const matchString = (el.className || '') + ' ' + (el.id || '');

            // Allow if strictly positive
            if (this.REGEXPS.okMaybeItsACandidate.test(matchString) &&
                !this.REGEXPS.unlikelyCandidates.test(matchString)) {
                return;
            }

            if (this.REGEXPS.unlikelyCandidates.test(matchString)) {
                el.remove();
            }
        });

        // Divs to P conversion could go here, but omitted for lite version
    }

    private grabArticle(): HTMLElement | null {
        // 0. High Confidence Selectors (Platform Specific Shortcuts)
        // WeChat: #js_content, Zhihu: .QuestionAnswer-content
        const knownSelectors = ['#js_content', '.rich_media_content', '.QuestionAnswer-content', '.article-content'];
        for (const sel of knownSelectors) {
            const el = this.doc.querySelector(sel) as HTMLElement;
            if (el && (el.innerText || '').length > 200) {
                console.log('ReadabilityLite: Found high-confidence container:', sel);
                this.cleanArticle(el);
                return el;
            }
        }

        // We score paragraphs and their parents
        // Expanded to include 'section' for modern layouts (like WeChat/Notion-like sites)
        const paragraphs = Array.from(this.doc.querySelectorAll('p, td, pre, section, blockquote'));
        const candidates = new Map<HTMLElement, number>();

        paragraphs.forEach(node => {
            const el = node as HTMLElement;
            const text = el.innerText || '';

            // Ignore short paragraphs unless they look like code
            if (text.length < 25 && el.tagName !== 'PRE') return;

            // Initialize scores for parent and grandparent
            const parent = el.parentElement;
            if (parent) {
                this.initializeNode(parent, candidates);
                this.incrementScore(parent, candidates, text.length);
            }

            // Also score grandparent
            if (parent && parent.parentElement) {
                const grandParent = parent.parentElement;
                this.initializeNode(grandParent, candidates);
                // Grandparent gets half value
                this.incrementScore(grandParent, candidates, text.length / 2);
            }
        });

        // Find winner
        let topCandidate: HTMLElement | null = null;
        let highestScore = 0;

        candidates.forEach((score, el) => {
            // Scale score by link density (high link density = bad)
            const linkDensity = this.getLinkDensity(el);
            const finalScore = score * (1 - linkDensity);

            if (finalScore > highestScore) {
                highestScore = finalScore;
                topCandidate = el;
            }
        });

        // If no top candidate found, fallback to body
        if (!topCandidate || highestScore < 100) {
            // Try to find <article> or <main> as fallback
            const semantic = this.doc.querySelector('article') || this.doc.querySelector('main');
            if (semantic) return semantic as HTMLElement;
            return this.doc.body;
        }

        // Now we have the top candidate. 
        // We should also include siblings that might have been missed (e.g. intro paragraph before the main div)
        // For 'lite' version, we just return the cleaned top candidate.
        // But first, clean it further.
        this.cleanArticle(topCandidate);

        return topCandidate;
    }

    private initializeNode(node: HTMLElement, map: Map<HTMLElement, number>) {
        if (!map.has(node)) {
            let score = 0;
            switch (node.tagName) {
                case 'ARTICLE': score = 10; break;
                case 'SECTION': score = 5; break;
                case 'DIV': score = 5; break;
                case 'PRE': score = 3; break;
                case 'BLOCKQUOTE': score = 3; break;
            }

            // Class/ID weighting
            const matchString = (node.className || '') + ' ' + (node.id || '');
            if (this.REGEXPS.positive.test(matchString)) score += 25;
            if (this.REGEXPS.negative.test(matchString)) score -= 25;

            map.set(node, score);
        }
    }

    private incrementScore(node: HTMLElement, map: Map<HTMLElement, number>, points: number) {
        const current = map.get(node) || 0;
        map.set(node, current + points);
    }

    private getLinkDensity(node: HTMLElement): number {
        const textLength = node.textContent?.length || 0;
        if (textLength === 0) return 0;

        let linkLength = 0;
        node.querySelectorAll('a').forEach(a => {
            linkLength += (a.textContent?.length || 0);
        });

        return linkLength / textLength;
    }

    private cleanArticle(article: HTMLElement) {
        // 1. Structural cleaning based on class/id/tag
        const trash = [
            'form', 'object', 'iframe', 'textarea', 'input', 'button',
            // Universal noise classes
            '.share', '.shared', '.social', '.sociable', '.sns', '.contact',
            '.related', '.related-posts', '.related-content', '.recommend',
            '.copyright', '.credit', '.source', '.author-bio',
            '.meta', '.metadata', '.post-meta',
            '.newsletter', '.signup', '.subscribe',
            '.footer', '.foot', '.bottom',
            '.comments', '.comment-list', '.comment-box',
            // Specific Platform noise
            '.reward_area', '#js_sponsor_ad_area', '.weui-loadmore',
            '.rich_media_tool', '.js_click_ad', '#js_pc_qr_code',
            '.lb-container' // CSDN login box
        ];

        trash.forEach(sel => {
            article.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 2. Trailing Junk Cleanup (Bottom-up scan)
        // Many articles have random "likes", "read count", "next/prev" links at the end
        // that are inside the main container but aren't substantive.
        let lastChild = article.lastElementChild;
        while (lastChild) {
            const prev = lastChild.previousElementSibling;
            if (this.isTrailingJunk(lastChild as HTMLElement)) {
                lastChild.remove();
                lastChild = prev;
            } else {
                // Found something substantial, stop deleting
                break;
            }
        }

        // 3. Link Density check for remaining blocks
        // Remove internal divs that look like nav/lists
        article.querySelectorAll('div, ul, section, aside').forEach(el => {
            const hEl = el as HTMLElement;
            // Don't remove the article itself or heavy containers we just cleaned
            if (hEl.contains(article) || hEl === article) return;

            const density = this.getLinkDensity(hEl);
            const length = hEl.textContent?.length || 0;

            // High density small blocks are likely junk (navs, tag lists)
            if (density > 0.6 && length < 300) {
                hEl.remove();
            }
        });
    }

    private isTrailingJunk(node: HTMLElement): boolean {
        // Tag check
        if (['HR', 'BR'].includes(node.tagName)) return true;

        const text = (node.innerText || '').trim();
        const len = text.length;

        // 1. Empty or very short elements are often spacers
        if (len === 0) return true;

        // 2. Check for Noise Keywords in short blocks
        if (len < 100) {
            const noise = /喜欢|赞|reading|read|share|views|关注|reward|copy|copyright|license|next|prev|扫描|二维码|QR|订阅|subscribe/i;
            if (noise.test(text)) return true;
        }

        // 3. Link Density Check (Next/Prev article links)
        const density = this.getLinkDensity(node);
        if (len < 200 && density > 0.5) return true;

        // 4. Specific "Loading" junk
        if (/loading|加载中/.test(text)) return true;

        return false;
    }

    private getExcerpt(node: HTMLElement): string {
        return node.textContent?.substring(0, 150).trim() + '...' || '';
    }
}
