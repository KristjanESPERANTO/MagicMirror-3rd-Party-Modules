export interface ResultMarkdownStats {
  issueCounter: number;
  lastUpdate: string;
  maintainer: Record<string, number>;
  moduleCounter: number;
  modulesWithIssuesCounter: number;
  repositoryHoster: Record<string, number>;
}

export interface IssueSummary {
  issues: string[];
  maintainer: string;
  name: string;
  url?: string;
}

interface Stage5ModuleLike {
  issues?: boolean | string[] | string | null;
  maintainer?: string;
  name?: string;
  url?: string;
}

export function normalizeIssuesInput(issues: string[] | string | boolean | null | undefined): string[] {
  if (Array.isArray(issues)) {
    return issues.slice();
  }

  if (typeof issues === "string" && issues.length > 0) {
    return [issues];
  }

  return [];
}

export function collectIssueSummaries(modules: unknown[]): IssueSummary[] {
  return modules.flatMap((module): IssueSummary[] => {
    if (!module || typeof module !== "object") {
      return [];
    }

    const stageModule = module as Stage5ModuleLike;
    const issues = normalizeIssuesInput(stageModule.issues);

    if (issues.length === 0 || typeof stageModule.name !== "string" || typeof stageModule.maintainer !== "string") {
      return [];
    }

    return [{
      issues,
      maintainer: stageModule.maintainer,
      name: stageModule.name,
      url: typeof stageModule.url === "string" ? stageModule.url : undefined
    }];
  });
}

export function buildResultMarkdown(stats: ResultMarkdownStats, summaries: IssueSummary[]): string {
  const lines: string[] = [];
  lines.push("# Result of the module analysis", "");
  lines.push(`Last update: ${stats.lastUpdate}`, "");
  lines.push("## General notes", "");
  lines.push(
    "* This is an automated analysis of the modules. It is not perfect and can contain errors. If you have any questions or suggestions, please open an issue on GitHub."
  );
  lines.push(
    "* Some issues are opinionated recommendations. Please feel free to ignore them.",
    ""
  );
  lines.push("## Statistics", "");
  lines.push("|                      | number   |");
  lines.push("|:---------------------|:--------:|");
  lines.push(
    `| modules analyzed     | ${String(stats.moduleCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| maintainers          | ${String(Object.keys(stats.maintainer).length).padStart(6, " ")}   |`
  );
  lines.push(
    `| modules with issues  | ${String(stats.modulesWithIssuesCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| issues               | ${String(stats.issueCounter).padStart(6, " ")}   |`
  );

  for (const [hoster, count] of Object.entries(stats.repositoryHoster)) {
    lines.push(
      `| modules at ${hoster.padEnd(9, " ")} | ${String(count).padStart(6, " ")}   |`
    );
  }

  lines.push("", "## Modules with issues");

  for (const summary of summaries) {
    lines.push(
      "",
      `### [${summary.name} by ${summary.maintainer}](${summary.url})`,
      ""
    );
    summary.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`);
    });
  }

  return `${lines.join("\n")}\n`;
}