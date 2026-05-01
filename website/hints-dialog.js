let issuesCachePromise = null;

function fetchIssues() {
  if (!issuesCachePromise) {
    issuesCachePromise = fetch("data/issues.json")
      .then(res => res.json())
      .catch(() => ({}));
  }
  return issuesCachePromise;
}

function formatIssueText(text) {
  return text
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>")
    .replace(/\n/gu, "<br>");
}

function renderIssuesList(issues) {
  if (!issues?.length) {
    return "<p>No issues found for this module.</p>";
  }

  const items = issues.map(text => `<li>${formatIssueText(text)}</li>`);
  return `<ol>${items.join("")}</ol>`;
}

export async function openHintsDialog(moduleData, fullUrl) {
  const dialog = document.getElementById("hints-dialog");
  const title = document.getElementById("hints-dialog-title");
  const body = document.getElementById("hints-dialog-body");
  const fullLink = document.getElementById("hints-dialog-fulllink");

  title.textContent = `${moduleData.name} by ${moduleData.maintainer}`;
  body.innerHTML = "<p>Loading…</p>";
  fullLink.href = fullUrl;
  dialog.showModal();

  const issuesMap = await fetchIssues();
  body.innerHTML = renderIssuesList(issuesMap[moduleData.id]);
}

document.getElementById("hints-dialog-close").addEventListener("click", () => {
  document.getElementById("hints-dialog").close();
});

document.getElementById("hints-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    event.currentTarget.close();
  }
});
