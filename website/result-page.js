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

function extractGeneralNotesMarkdown(lines) {
  const startIndex = lines.findIndex(
    line => line.trim() === "## General notes"
  );
  if (startIndex === -1) {
    return [];
  }

  const notes = [];
  for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    if (/^##\s+/u.test(lines[lineIndex])) {
      break;
    }
    notes.push(lines[lineIndex]);
  }

  return notes;
}

function extractModuleSectionMarkdown(lines, moduleSlug) {
  let startIndex = -1;

  for (const [lineIndex, line] of lines.entries()) {
    if (line.startsWith("### ")) {
      const headingText = parseModuleHeadingText(line);
      if (normalizeModuleSlug(headingText) === moduleSlug) {
        startIndex = lineIndex;
        break;
      }
    }
  }

  if (startIndex === -1) {
    return null;
  }

  let endIndex = lines.length;
  for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    if (lines[lineIndex].startsWith("### ")) {
      endIndex = lineIndex;
      break;
    }
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
  const outputLines = [moduleHeadingLine, ""];

  if (generalNotes.length > 0) {
    outputLines.push("### General notes", "", ...generalNotes, "");
  }

  outputLines.push("### Findings", "", ...moduleSection.bodyLines);

  return {
    markdown: outputLines.join("\n").trim(),
    title: moduleSection.title
  };
}

function setPageTitle(title) {
  document.title = `${title} · Module hints`;
}

async function loadAndDisplayMarkdown() {
  const markdownContainer = document.getElementById("markdown-container");
  const markdownFile = "result.md";
  const moduleSlug = new URLSearchParams(window.location.search).get(
    "module"
  );
  const fullResultsLink = document.getElementById("full-results-link");
  const markedParser = window.marked?.parse;

  if (typeof markedParser !== "function") {
    throw new Error("Marked parser is not available");
  }

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
        markdownContainer.innerHTML = markedParser(filtered.markdown);
        setPageTitle(filtered.title);
        fullResultsLink.href = "result.html";
        fullResultsLink.textContent = "Full hints list";
      }
      else {
        markdownContainer.innerHTML
          = "<p>No hints found for this module.</p>";
        setPageTitle("Module hints");
        fullResultsLink.href = "result.html";
        fullResultsLink.textContent = "Full hints list";
      }
    }
    else {
      markdownContainer.innerHTML = markedParser(markdownText);
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

window.onload = loadAndDisplayMarkdown;
