// @ts-nocheck
export function parseCommaSeparatedList(value, previous = []) {
  if (!value) {
    return previous;
  }

  const parsed = value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);

  return [...previous, ...parsed];
}

export function normalizeStageFilters({ only = [], skip = [] } = {}) {
  const normalize = values => Array.from(new Set(values
    .map(value => value.trim())
    .filter(Boolean)));

  return {
    only: normalize(only),
    skip: normalize(skip)
  };
}

export function applyStageFilters(stages, filters) {
  const stageIdSet = new Set(stages.map(stage => stage.id));

  const unknownOnly = filters.only.filter(stageId => !stageIdSet.has(stageId));
  if (unknownOnly.length > 0) {
    throw new Error(`Unknown stage id${unknownOnly.length > 1 ? "s" : ""} in --only: ${unknownOnly.join(", ")}`);
  }

  const unknownSkip = filters.skip.filter(stageId => !stageIdSet.has(stageId));
  if (unknownSkip.length > 0) {
    throw new Error(`Unknown stage id${unknownSkip.length > 1 ? "s" : ""} in --skip: ${unknownSkip.join(", ")}`);
  }

  let selectedStages = stages;

  if (filters.only.length > 0) {
    const onlySet = new Set(filters.only);
    selectedStages = stages.filter(stage => onlySet.has(stage.id));

    if (selectedStages.length === 0) {
      throw new Error("No stages matched the provided --only filters.");
    }
  }

  if (filters.skip.length > 0) {
    const skipSet = new Set(filters.skip);
    selectedStages = selectedStages.filter(stage => !skipSet.has(stage.id));
  }

  if (selectedStages.length === 0) {
    throw new Error("All stages were filtered out. Nothing to run.");
  }

  const selectedStageIds = new Set(selectedStages.map(stage => stage.id));
  const unmetDependencies = [];

  for (const stage of selectedStages) {
    const dependencies = Array.isArray(stage.dependsOn) ? stage.dependsOn : [];
    const missingDependencies = dependencies.filter(stageId => !selectedStageIds.has(stageId));

    if (missingDependencies.length > 0) {
      unmetDependencies.push(`${stage.id} requires ${missingDependencies.join(", ")}`);
    }
  }

  if (unmetDependencies.length > 0) {
    throw new Error(`Selected stages have unmet dependencies: ${unmetDependencies.join("; ")}`);
  }

  const skippedStages = stages.filter(stage => !selectedStageIds.has(stage.id));

  return {
    selectedStages,
    skippedStages
  };
}
