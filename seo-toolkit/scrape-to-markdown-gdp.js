/* 
   GDP Enhanced Scrape-to-Markdown v2
   Based on e-orlov/Screaming-Frog-Custom-Javascript scrape-to-markdown-on-steroids.js
   Enhanced for GDP SEO/GEO audit pipeline:
   - Fallback content selectors (article → main → #content → body)
   - Extracts schema markup (JSON-LD, Open Graph, Twitter Card)
   - Extracts heading structure for content audits
   - Extracts internal/external link inventory
   - Captures word count, reading time
   - Strips nav, footer, sidebar, cookie banners, ads
   - Clean markdown output with YAML frontmatter
   
   Usage: Add as Custom JavaScript in Screaming Frog SEO Spider
   Settings: Enable JavaScript rendering, set render timer to 5+ seconds
*/

function loadTurndown() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (typeof TurndownService !== 'undefined') return resolve();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/turndown/dist/turndown.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Turndown.js'));
        document.head.appendChild(script);
    });
}

function extractMeta() {
    const getMeta = (sel) => {
        const el = document.querySelector(sel);
        return el ? (el.getAttribute('content') || '').trim() : '';
    };
    
    const meta = {
        title: document.title || '',
        description: getMeta('meta[name="description"]'),
        ogTitle: getMeta('meta[property="og:title"]'),
        ogDescription: getMeta('meta[property="og:description"]'),
        ogImage: getMeta('meta[property="og:image"]'),
        ogType: getMeta('meta[property="og:type"]'),
        ogUrl: getMeta('meta[property="og:url"]'),
        twitterCard: getMeta('meta[name="twitter:card"]'),
        twitterTitle: getMeta('meta[name="twitter:title"]'),
        twitterDescription: getMeta('meta[name="twitter:description"]'),
        twitterImage: getMeta('meta[name="twitter:image"]'),
        canonical: (() => {
            const el = document.querySelector('link[rel="canonical"]');
            return el ? el.getAttribute('href') || '' : '';
        })(),
        robots: getMeta('meta[name="robots"]'),
    };
    
    // Extract JSON-LD schema
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const schemas = [];
    jsonLdScripts.forEach(s => {
        try {
            const parsed = JSON.parse(s.textContent);
            if (Array.isArray(parsed)) {
                schemas.push(...parsed);
            } else {
                schemas.push(parsed);
            }
        } catch(e) { /* skip invalid JSON-LD */ }
    });
    meta.schemaTypes = schemas.map(s => s['@type'] || 'unknown').join(', ');
    meta.schemaCount = schemas.length;
    
    return meta;
}

function extractHeadingStructure() {
    const headings = [];
    const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    allHeadings.forEach(h => {
        headings.push({
            level: parseInt(h.tagName[1]),
            text: h.textContent.trim().slice(0, 200)
        });
    });
    return headings;
}

function extractLinkInventory() {
    const links = document.querySelectorAll('a[href]');
    const currentHost = window.location.hostname;
    const internal = [];
    const external = [];
    const seen = new Set();
    
    links.forEach(a => {
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        
        try {
            const url = new URL(href, window.location.href);
            const key = url.href;
            if (seen.has(key)) return;
            seen.add(key);
            
            const linkData = {
                url: url.href,
                text: a.textContent.trim().slice(0, 100),
                rel: a.getAttribute('rel') || '',
                nofollow: (a.getAttribute('rel') || '').includes('nofollow'),
            };
            
            if (url.hostname === currentHost) {
                internal.push(linkData);
            } else {
                external.push(linkData);
            }
        } catch(e) { /* skip invalid URLs */ }
    });
    
    return {
        internalCount: internal.length,
        externalCount: external.length,
        nofollowCount: [...internal, ...external].filter(l => l.nofollow).length,
        externalLinks: external.slice(0, 20).map(l => `${l.nofollow ? 'nofollow ' : ''}${l.url} (${l.text})`),
    };
}

function extractContent() {
    const meta = extractMeta();
    const headings = extractHeadingStructure();
    const linkInv = extractLinkInventory();
    
    // Try multiple content selectors — article → main → #content → .content → body
    const selectors = ['article', 'main', '#content', '.content', '.post-content', '.entry-content', '#main-content'];
    let contentEl = null;
    let selectorUsed = '';
    
    for (const sel of selectors) {
        contentEl = document.querySelector(sel);
        if (contentEl) {
            selectorUsed = sel;
            break;
        }
    }
    
    // Fallback: clone body and strip noise
    if (!contentEl) {
        contentEl = document.body.cloneNode(true);
        // Remove nav, footer, sidebar, cookie banners, ads, scripts
        contentEl.querySelectorAll('nav, footer, aside, .sidebar, .cookie-banner, .cookie-notice, #cookie-banner, script, style, noscript, iframe, .ad, .ads, .advertisement, .social-share, .share-buttons, .comments, #comments').forEach(e => e.remove());
        selectorUsed = 'body (stripped)';
    } else {
        // Even with a content element, strip nested noise
        contentEl.querySelectorAll('script, style, noscript, iframe, .ad, .ads, .advertisement, .social-share, .share-buttons, .comments, #comments, nav, footer').forEach(e => e.remove());
    }
    
    // Convert to markdown
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-'
    });
    
    // Clean image rules — skip tracking pixels and empty alt
    turndownService.addRule('cleanImages', {
        filter: 'img',
        replacement: function(content, node) {
            const alt = node.getAttribute('alt') || '';
            const src = node.getAttribute('src') || '';
            if (!src || src.startsWith('data:')) return '';
            if (!alt.trim()) return '';
            // Make relative URLs absolute
            try {
                const absSrc = new URL(src, window.location.href).href;
                return '![' + alt + '](' + absSrc + ')';
            } catch(e) {
                return '![' + alt + '](' + src + ')';
            }
        }
    });
    
    // Remove empty links
    turndownService.addRule('removeEmptyLinks', {
        filter: function(node) {
            return node.nodeName === 'A' && !node.textContent.trim();
        },
        replacement: function() { return ''; }
    });
    
    // Clean up links — keep text, preserve href
    turndownService.addRule('cleanLinks', {
        filter: 'a',
        replacement: function(content, node) {
            const href = node.getAttribute('href') || '';
            if (!href || href.startsWith('#')) return content;
            try {
                const absHref = new URL(href, window.location.href).href;
                return '[' + content + '](' + absHref + ')';
            } catch(e) {
                return '[' + content + '](' + href + ')';
            }
        }
    });
    
    let markdown = '';
    try {
        markdown = turndownService.turndown(contentEl.innerHTML)
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    } catch(e) {
        markdown = 'Error converting content: ' + e.message;
    }
    
    // Calculate metrics
    const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;
    const readingTime = Math.ceil(wordCount / 200); // 200 WPM average
    const h1Count = headings.filter(h => h.level === 1).length;
    const h2Count = headings.filter(h => h.level === 2).length;
    
    // Build heading outline
    const headingOutline = headings.map(h => '  '.repeat(h.level - 1) + '#'.repeat(h.level) + ' ' + h.text).join('\n');
    
    // Build YAML frontmatter
    const yaml = [
        '---',
        'url: "' + window.location.href + '"',
        'title: "' + meta.title.replace(/"/g, '\\"') + '"',
        'description: "' + meta.description.replace(/"/g, '\\"') + '"',
        'canonical: "' + meta.canonical + '"',
        'og_title: "' + meta.ogTitle.replace(/"/g, '\\"') + '"',
        'og_description: "' + meta.ogDescription.replace(/"/g, '\\"') + '"',
        'og_image: "' + meta.ogImage + '"',
        'og_type: "' + meta.ogType + '"',
        'twitter_card: "' + meta.twitterCard + '"',
        'robots: "' + meta.robots + '"',
        'schema_types: "' + meta.schemaTypes + '"',
        'schema_count: ' + meta.schemaCount,
        'content_selector: "' + selectorUsed + '"',
        'word_count: ' + wordCount,
        'reading_time_min: ' + readingTime,
        'h1_count: ' + h1Count,
        'h2_count: ' + h2Count,
        'heading_count: ' + headings.length,
        'internal_links: ' + linkInv.internalCount,
        'external_links: ' + linkInv.externalCount,
        'nofollow_links: ' + linkInv.nofollowCount,
        'extracted_at: "' + new Date().toISOString() + '"',
        '---',
        '',
    ].join('\n');
    
    // SEO audit flags
    const auditFlags = [];
    if (h1Count === 0) auditFlags.push('⚠️ No H1 found');
    if (h1Count > 1) auditFlags.push('⚠️ Multiple H1s (' + h1Count + ')');
    if (!meta.description) auditFlags.push('⚠️ Missing meta description');
    if (meta.description.length > 160) auditFlags.push('⚠️ Meta description too long (' + meta.description.length + ' chars)');
    if (!meta.canonical) auditFlags.push('⚠️ Missing canonical URL');
    if (!meta.ogTitle) auditFlags.push('⚠️ Missing Open Graph title');
    if (!meta.ogImage) auditFlags.push('⚠️ Missing Open Graph image');
    if (meta.schemaCount === 0) auditFlags.push('⚠️ No structured data (JSON-LD)');
    if (wordCount < 300) auditFlags.push('⚠️ Thin content (' + wordCount + ' words)');
    if (linkInv.externalCount > 100) auditFlags.push('⚠️ Excessive external links (' + linkInv.externalCount + ')');
    
    const auditSection = auditFlags.length > 0
        ? '\n\n## SEO Audit Flags\n\n' + auditFlags.map(f => '- ' + f).join('\n') + '\n'
        : '\n\n## SEO Audit Flags\n\n✅ No critical issues detected.\n';
    
    // Heading outline section
    const headingSection = '\n\n## Page Heading Structure\n\n```markdown\n' + headingOutline + '\n```\n';
    
    // External links section
    const linkSection = linkInv.externalLinks.length > 0
        ? '\n\n## External Links (top 20)\n\n' + linkInv.externalLinks.map(l => '- ' + l).join('\n') + '\n'
        : '\n\n## External Links\n\nNo external links found.\n';
    
    const output = yaml + markdown + auditSection + headingSection + linkSection;
    
    return output;
}

return loadTurndown()
    .then(() => seoSpider.data(extractContent()))
    .catch(error => seoSpider.error(error));