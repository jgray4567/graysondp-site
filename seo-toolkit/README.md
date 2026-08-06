# GDP SEO/GEO Toolkit — Screaming Frog Custom Scripts

Custom JavaScript scripts for Screaming Frog SEO Spider, enhanced for the GDP SEO/GEO audit pipeline.

## Scripts

### GDP Enhanced (our versions)

| Script | Purpose |
|--------|---------|
| `scrape-to-markdown-gdp.js` | **Primary.** Extracts page content as clean markdown with YAML frontmatter, SEO audit flags, heading structure, link inventory, schema detection. Fallback content selectors (article → main → #content → body). |
| `llms-full-txt.js` | Generates `llms-full.txt` for crawled URLs — critical for AI search optimization (LLMs.txt standard). Uses Readability.js + Turndown.js. |

### Third-Party (from e-orlov/Screaming-Frog-Custom-Javascript)

| Script | Purpose |
|--------|---------|
| `scrape-to-markdown-on-steroids.js` | Original markdown extraction (article only, basic). Our enhanced version above. |
| `apc-page-content-agent.js` | Full page content extraction (Chromium rendered). More thorough than markdown. |
| `check-indexing-serpapi.js` | Checks URL indexing status via SerpApi. Requires API key. |
| `content-to-tts.js` | Preps content for text-to-speech — accessibility audit use case. |
| `semantic-embeddings.js` | Generates embeddings from page content for semantic analysis. |
| `embeddings-without-stopwords.js` | Same but strips stopwords first. |
| `image-embeddings-tensorflow.js` | Image embeddings via TensorFlow.js. |
| `sistrix-domain.kwcount.top10.js` | Sistrix top-10 keyword count. Requires API key. |
| `sistrix-url-search-visibility.js` | Sistrix mobile search visibility. Requires API key. |
| `get-data-from-get-based-api-with-json-response-for-crawled-urls.js` | Generic GET API query template (JSON). |
| `get-data-from-get-based-api-with-xml-response-for-crawled-urls.js` | Generic GET API query template (XML). |
| `acceptAllCookies-clickAction.js` | Auto-accepts cookie banners during crawl. |

## Usage

1. Open Screaming Frog SEO Spider
2. Go to **Configuration → Custom → Custom JavaScript**
3. Add the script file you want to use
4. Enable **JavaScript rendering** (Configuration → Spider → Rendering → JavaScript)
5. Set render timer to 5+ seconds (some sites need more)
6. Crawl — extracted data appears in Custom JavaScript tab

## GDP Audit Pipeline Integration

```
Prospect URL → Screaming Frog crawl (with scrape-to-markdown-gdp.js)
    → Markdown + SEO flags per page
    → AI visibility analysis (GLM-5.2 / Brainwave)
    → GEO audit report
    → Free scan → $79 audit → $15-25K build → $500-2K/mo retainer
```

## Enhanced Script Output

The `scrape-to-markdown-gdp.js` script outputs clean markdown with:

- **YAML frontmatter** — URL, title, description, canonical, OG tags, Twitter Card, schema types, content selector used, word count, reading time, link counts
- **SEO audit flags** — missing H1, multiple H1s, missing meta description, missing canonical, no schema, thin content, excessive links
- **Page heading structure** — full H1-H6 outline
- **External link inventory** — top 20 external links with nofollow detection
- **Clean markdown body** — nav/footer/sidebar/ads stripped, images with absolute URLs

## Source

Original scripts: [e-orlov/Screaming-Frog-Custom-Javascript](https://github.com/e-orlov/Screaming-Frog-Custom-Javascript)
GDP enhancements: Grayson Design Partners, 2026