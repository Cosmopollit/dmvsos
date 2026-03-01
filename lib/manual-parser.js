import fs from 'fs';
import path from 'path';

const MANUALS_DIR = path.join(process.cwd(), 'data', 'manuals');

/**
 * Get list of available manual files for a state.
 * Returns { car: true, cdl: true, motorcycle: false } etc.
 */
export function getAvailableCategories(stateSlug) {
  const categories = {};
  for (const cat of ['car', 'cdl', 'motorcycle']) {
    const filePath = path.join(MANUALS_DIR, `${stateSlug}-${cat}-en.txt`);
    categories[cat] = fs.existsSync(filePath);
  }
  return categories;
}

/**
 * Parse a manual text file into structured sections.
 * Returns { title, totalPages, sections: [{ title, slug, content, pageStart }], excerpt }
 */
export function parseManual(stateSlug, category = 'car') {
  const filePath = path.join(MANUALS_DIR, `${stateSlug}-${category}-en.txt`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');

  // Split on page break markers: -- N of M --
  const pagePattern = /^-- (\d+) of (\d+) --$/gm;
  const pages = [];
  let totalPages = 0;

  // Find all page markers
  const markers = [];
  let match;
  while ((match = pagePattern.exec(raw)) !== null) {
    markers.push({ index: match.index, pageNum: parseInt(match[1]), total: parseInt(match[2]) });
    totalPages = parseInt(match[2]);
  }

  if (markers.length === 0) {
    // No page markers — treat entire file as one section
    return {
      title: 'Driver Manual',
      totalPages: 1,
      sections: [{ title: 'Full Manual', slug: 'full-manual', content: raw.trim(), pageStart: 1 }],
      excerpt: raw.slice(0, 300).trim(),
    };
  }

  // Extract text before first marker as front matter
  const frontMatter = raw.slice(0, markers[0].index).trim();

  // Extract page content between markers
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + `-- ${markers[i].pageNum} of ${markers[i].total} --`.length;
    const end = i + 1 < markers.length ? markers[i + 1].index : raw.length;
    pages.push({
      pageNum: markers[i].pageNum,
      content: raw.slice(start, end).trim(),
    });
  }

  // Try to detect title from front matter or first pages
  let title = 'Driver Manual';
  const titleMatch = frontMatter.match(/(?:DRIVER'?S?\s+HANDBOOK|DRIVER'?S?\s+GUIDE|DRIVER'?S?\s+MANUAL|DRIVER\s+GUIDE)/i);
  if (titleMatch) {
    title = titleMatch[0];
  }

  // Clean section title: remove trailing dots, page numbers, tab-separated document names
  function cleanSectionTitle(rawTitle) {
    return rawTitle.trim()
      .replace(/\.{2,}\d*$/, '')      // trailing dots + page number
      .replace(/\t.+$/, '')           // tab + document name suffix
      .replace(/\s+$/, '');
  }

  const sections = [];
  let currentSection = null;
  const seenSections = new Set();

  for (const page of pages) {
    const lines = page.content.split('\n');
    let foundHeader = false;

    // Skip pages that look like a Table of Contents (many dotted lines or "Table of Contents" header)
    const pageText = page.content;
    const hasTocHeader = /table of contents/i.test(pageText);
    const dotLines = lines.filter(l => /\.{3,}\s*\d+\s*$/.test(l.trim())).length;
    if (dotLines >= 3 || hasTocHeader) {
      // This is a TOC page — append to intro, don't parse headers from it
      if (currentSection) {
        currentSection.content += '\n\n' + page.content;
      } else {
        currentSection = {
          title: 'Introduction',
          slug: 'introduction',
          content: page.content,
          pageStart: page.pageNum,
        };
      }
      continue;
    }

    for (let li = 0; li < Math.min(lines.length, 5); li++) {
      const line = lines[li].trim();
      if (!line) continue;

      // Check for Chapter/Section headers
      const chapterMatch = line.match(/^(?:SECTION|CHAPTER|Chapter|Section)\s+(\d+)[.:\s]+(.+)/);
      if (chapterMatch) {
        const sectionNum = chapterMatch[1];
        // Skip duplicate section numbers (e.g., from TOC remnants)
        if (seenSections.has(sectionNum)) {
          // Check currentSection first, then sections array
          if (currentSection && currentSection.slug === `section-${sectionNum}`) {
            // Replace the old (likely TOC-sourced) section with this real content
            currentSection.content = page.content;
            currentSection.pageStart = page.pageNum;
            // Clean up title if the old one had trailing dots
            const cleanTitle = cleanSectionTitle(chapterMatch[2]);
            const keyword = chapterMatch[0].match(/^(SECTION|CHAPTER|Chapter|Section)/)[0];
            currentSection.title = `${keyword} ${sectionNum}: ${cleanTitle}`;
            foundHeader = true;
            break;
          }
          const existing = sections.find(s => s.slug === `section-${sectionNum}`);
          if (existing) {
            existing.content = page.content;
            existing.pageStart = page.pageNum;
            const cleanTitle = cleanSectionTitle(chapterMatch[2]);
            const keyword = chapterMatch[0].match(/^(SECTION|CHAPTER|Chapter|Section)/)[0];
            existing.title = `${keyword} ${sectionNum}: ${cleanTitle}`;
            foundHeader = true;
            break;
          }
        }
        if (currentSection) sections.push(currentSection);
        seenSections.add(sectionNum);
        const sectionTitle = cleanSectionTitle(chapterMatch[2]);
        const keyword = chapterMatch[0].match(/^(SECTION|CHAPTER|Chapter|Section)/)[0];
        currentSection = {
          title: `${keyword} ${sectionNum}: ${sectionTitle}`,
          slug: `section-${sectionNum}`,
          content: page.content,
          pageStart: page.pageNum,
        };
        foundHeader = true;
        break;
      }
    }

    if (!foundHeader && currentSection) {
      currentSection.content += '\n\n' + page.content;
    } else if (!foundHeader && !currentSection) {
      currentSection = {
        title: 'Introduction',
        slug: 'introduction',
        content: page.content,
        pageStart: page.pageNum,
      };
    }
  }

  if (currentSection) sections.push(currentSection);

  // If we got very few sections (< 3), fall back to page-based chunking
  if (sections.length < 3) {
    const chunked = chunkPages(pages);
    const excerpt = (frontMatter + '\n' + (pages[0]?.content || '')).slice(0, 300).trim();
    return { title, totalPages, sections: chunked, excerpt };
  }

  const excerpt = (frontMatter + '\n' + (pages[0]?.content || '')).slice(0, 300).trim();
  return { title, totalPages, sections, excerpt };
}

/**
 * Fallback: group pages into chunks of ~10 pages each
 */
function chunkPages(pages) {
  const CHUNK_SIZE = 10;
  const sections = [];

  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    const chunk = pages.slice(i, i + CHUNK_SIZE);
    const startPage = chunk[0].pageNum;
    const endPage = chunk[chunk.length - 1].pageNum;
    sections.push({
      title: `Pages ${startPage}–${endPage}`,
      slug: `pages-${startPage}-${endPage}`,
      content: chunk.map(p => p.content).join('\n\n'),
      pageStart: startPage,
    });
  }

  return sections;
}

/**
 * Get all states that have manual files available.
 */
export function getStatesWithManuals() {
  if (!fs.existsSync(MANUALS_DIR)) return [];
  const files = fs.readdirSync(MANUALS_DIR);
  const states = new Set();
  for (const f of files) {
    const match = f.match(/^(.+)-car-en\.txt$/);
    if (match) states.add(match[1]);
  }
  return Array.from(states).sort();
}
