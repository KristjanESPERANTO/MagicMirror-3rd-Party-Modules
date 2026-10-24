export const WORKFLOW_VERSION_POLICY = Object.freeze({
  actions: Object.freeze({
    "actions/checkout": Object.freeze({
      ruleId: "text-recommend-actions-checkout",
      currentMajor: 7
    }),
    "actions/setup-node": Object.freeze({
      ruleId: "text-recommend-actions-setup-node",
      currentMajor: 7
    })
  }),
  node: Object.freeze({
    ruleId: "text-deprecated-node-version",
    currentMajor: 22
  })
});