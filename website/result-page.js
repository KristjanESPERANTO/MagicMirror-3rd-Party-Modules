// eslint-disable-next-line import-x/no-unresolved
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

function normalizeModuleSlug(text) {
  return text
    .replaceAll(" ", "-")
    .replaceAll("&", "")
    .replaceAll("/", "");
}

function parseModuleHeadingText(line) {
  const linkedHeadingMatch = line.match(
    /^###\s+\[([^\]]+)\]\([^)]*\)\s*$/u
  );
  if (linkedHeadingMatch) {
    return linkedHeadingMatch[1];
  }

  const plainHeadingMatch = line.match(/^###\s+(.+)$/u);
  return plainHeadingMatch ? plainHeadingMatch[1].trim() : "";
}

function collectLinesUntil(lines, startIndex, isEndLine) {
  const collected = [];

  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isEndLine(line)) {
      break;
    }
    collected.push(line);
  }

  return collected;
}

function extractGeneralNotesMarkdown(lines) {
  const startIndex = lines.findIndex(
    line => line.trim() === "## General notes"
  );
  if (startIndex === -1) {
    return [];
  }

  return collectLinesUntil(
    lines,
    startIndex + 1,
    line => /^##\s+/u.test(line)
  );
}

function extractModuleSectionMarkdown(lines, moduleSlug) {
  const startIndex = lines.findIndex((line) => {
    if (!line.startsWith("### ")) {
      return false;
    }

    const headingText = parseModuleHeadingText(line);
    return normalizeModuleSlug(headingText) === moduleSlug;
  });

  if (startIndex === -1) {
    return null;
  }

  const relativeEndIndex = lines
    .slice(startIndex + 1)
    .findIndex(line => line.startsWith("### "));
  let endIndex = lines.length;
  if (relativeEndIndex !== -1) {
    endIndex = startIndex + 1 + relativeEndIndex;
  }

  return {
    bodyLines: lines.slice(startIndex + 1, endIndex),
    headingLine: lines[startIndex],
    title: parseModuleHeadingText(lines[startIndex])
  };
}

function buildFilteredModuleMarkdown(markdownText, moduleSlug) {
  const lines = markdownText.split("\n");
  const moduleSection = extractModuleSectionMarkdown(lines, moduleSlug);
  if (!moduleSection) {
    return null;
  }

  const generalNotes = extractGeneralNotesMarkdown(lines);
  const moduleHeadingLine = moduleSection.headingLine.replace(/^###\s+/u, "## ");
  const outputLines = [];

  if (generalNotes.length > 0) {
    outputLines.push("### General notes", "", ...generalNotes, "");
  }

  outputLines.push(moduleHeadingLine, "");
  outputLines.push("### Findings", "", ...moduleSection.bodyLines);

  return {
    markdown: outputLines.join("\n").trim(),
    title: moduleSection.title
  };
}

function setPageTitle(title) {
  document.title = `${title} · Module hints`;
}

function setFullHintsListLink(fullResultsLink) {
  fullResultsLink.href = "result.html";
  fullResultsLink.textContent = "Full hints list";
}

async function loadAndDisplayMarkdown() {
  const markdownContainer = document.getElementById("markdown-container");
  const markdownFile = "result.md";
  const moduleSlug = new URLSearchParams(window.location.search).get(
    "module"
  );
  const fullResultsLink = document.getElementById("full-results-link");

  if (!moduleSlug) {
    fullResultsLink.remove();
  }

  try {
    const response = await fetch(markdownFile);
    if (!response.ok) {
      throw new Error(
        `Error fetching the markdown file: ${response.statusText}`
      );
    }
    const markdownText = await response.text();

    if (moduleSlug) {
      const filtered = buildFilteredModuleMarkdown(
        markdownText,
        moduleSlug
      );
      if (filtered) {
        markdownContainer.innerHTML = marked.parse(filtered.markdown);
        setPageTitle(filtered.title);
        setFullHintsListLink(fullResultsLink);
      }
      else {
        markdownContainer.innerHTML
          = "<p>No hints found for this module.</p>";
        setPageTitle("Module hints");
        setFullHintsListLink(fullResultsLink);
      }
    }
    else {
      markdownContainer.innerHTML = marked.parse(markdownText);
    }

    addHeadingAnchors();
  }
  catch (error) {
    console.error("Error loading markdown:", error);
    markdownContainer.innerHTML
      = "<p>Error loading markdown content.</p>";
  }
}

function addHeadingAnchors() {
  const markdownContainer = document.getElementById("markdown-container");
  const headings = markdownContainer.querySelectorAll("h1, h2, h3, h4");
  headings.forEach((heading) => {
    const anchorId = normalizeModuleSlug(heading.textContent);
    const anchor = document.createElement("a");
    anchor.id = anchorId;
    anchor.href = `#${anchorId}`;
    anchor.classList.add("heading-anchor");
    anchor.textContent = "#";
    heading.appendChild(anchor);
  });

  const hash = window.location.hash;
  if (hash) {
    const decodedHash = decodeURIComponent(hash);
    const targetId = decodedHash.startsWith("#")
      ? decodedHash.slice(1)
      : decodedHash;
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView();
    }
  }
}

loadAndDisplayMarkdown();
