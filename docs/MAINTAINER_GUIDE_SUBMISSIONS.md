# Maintainer Guide: Module Submissions

Quick reference for managing module submissions.

## 📥 Daily Workflow

### 1. Check for New Submissions

**Filter PRs:**

- Label: `module-submission`
- Status: Open

**Quick links:**

- [All module submissions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/pulls?q=is%3Apr+is%3Aopen+label%3Amodule-submission)
- [Ready for review](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/pulls?q=is%3Apr+is%3Aopen+label%3Avalidation-passed)

### 2. Review the Automated Validation Report

Each PR has a bot comment with validation results:

```markdown
## 🤖 Automated Validation Report

### ✅ JSON Schema Validation

- ✅ All submission files are valid

### 🔍 Duplicate Check

- ✅ No duplicates found

### 📦 Repository Validation

- ✅ Repository is accessible
- ✅ Contains package.json
- ✅ Contains LICENSE file
- ✅ Contains README.md
- ✅ License is MIT

### 🎯 Quality Checks

- ✅ Screenshot found
- ✅ Module name follows MMM-\* convention
- ✅ Package.json contains keywords
- ✅ Last commit: 2 days ago

---

## ✅ All Required Checks Passed!
```

**If all ✅:** Ready to approve!  
**If any ❌:** Request changes from submitter

### 3. Quick Manual Review

**Check these things:**

- [ ] Description makes sense and is in English
- [ ] Category is appropriate
- [ ] Not spam or malicious
- [ ] Module name is reasonable

**Usually takes: < 2 minutes**

### 4. Approve & Merge

```bash
# Option 1: GitHub Web UI
# - Click "Review changes"
# - Select "Approve"
# - Click "Merge pull request"

# Option 2: GitHub CLI
gh pr review PULL_NUMBER --approve
gh pr merge PULL_NUMBER --squash
```

**Done!** Module appears on website within 24 hours.

## 🎯 Handling Special Cases

### Duplicate Submission

**Bot will flag it, but if you catch one manually:**

```markdown
Thanks for your submission! However, this module is already listed in our registry:

- Existing entry: [Module Name](URL)

If you are the original author and want to update the information, please mention that in your submission.

Closing as duplicate.
```

**Action:** Close PR

### Invalid Repository

**If required files are missing:**

```markdown
Thanks for your submission! Before we can approve this, please ensure your repository contains:

- [ ] `package.json` with a valid license field
- [ ] `LICENSE` file
- [ ] `README.md` with installation instructions

Once these are added, the validation will automatically re-run.
```

**Action:** Request changes (don't close - let them fix it)

### Unclear/Poor Description

```markdown
Thanks for your submission! Could you please provide a more detailed description?

A good description should:

- Explain what the module does
- Mention key features
- Be written in English
- Be 1-2 sentences

Example: "Displays real-time public transportation schedules from Deutsche Bahn with customizable routes and refresh intervals."
```

**Action:** Request changes

### Spam or Malicious

**Immediate action:**

1. Close PR
2. Add label `spam`
3. Block user if repeated offense

```markdown
This submission has been closed as spam/malicious content.
```

### Update to Existing Module

**If submitter claims to update existing module:**

1. Verify they are the module author (check GitHub username)
2. If yes: approve
3. If no: ask for permission proof

```markdown
Thanks for the update! Just to verify: are you the original author of this module?

If not, do you have permission from @ORIGINAL_AUTHOR to update this entry?
```

## 👥 Managing Trusted Contributors

### Add a Trusted Contributor

**When:** User has proven to be reliable (e.g., 2-3 successful submissions, well-maintained modules)

**Via Web UI:**

1. Go to https://github.com/orgs/MagicMirrorOrg/teams/trusted-contributors
2. Click "Add a member"
3. Enter their username
4. Done!

**Via CLI:**

```bash
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X PUT
```

**Effect:** Their future submissions get auto-approved after validation passes.

### Remove a Trusted Contributor

**When:** If needed (spam, quality issues, user request)

**Via CLI:**

```bash
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X DELETE
```

### List Current Trusted Contributors

```bash
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/members --jq '.[].login'
```

## 🔧 Troubleshooting

### Bot Didn't Create PR from Issue

**Possible reasons:**

- Issue form wasn't used (user created blank issue)
- Required fields missing
- Workflow failed (check Actions tab)

**Fix:**

1. Check GitHub Actions for errors
2. Manually create PR if needed:
   - Create branch
   - Add JSON file to `module-submissions/pending/`
   - Open PR
   - Link to original issue

### Validation Failed but Looks OK

**Common causes:**

- API rate limit hit
- Repository temporarily unavailable
- Schema too strict

**Fix:**

1. Re-run workflow (close/reopen PR or push empty commit)
2. If still fails, review manually and approve

### User Can't Submit via Issue Form

**Common problems:**

- Form not found: Direct them to `/issues/new/choose`
- Required fields: Explain which are mandatory
- URL format: Must be full GitHub/GitLab URL

**Fallback:** Tell them to create PR directly

## 📊 Useful Commands

### Find submissions by status

```bash
# Waiting for review
gh pr list --label "module-submission,validation-passed"

# Validation failed
gh pr list --label "module-submission,validation-failed"

# Auto-approved (from trusted users)
gh pr list --label "auto-approved"
```

### Bulk operations

```bash
# Approve multiple PRs at once
for pr in 123 124 125; do
  gh pr review $pr --approve
  gh pr merge $pr --squash
done
```

### Statistics

```bash
# Count open submissions
gh pr list --label "module-submission" --state open --json number --jq 'length'

# Count merged this month
gh pr list --label "module-submission" --state merged --search "merged:>=$(date -d '1 month ago' +%Y-%m-%d)" --json number --jq 'length'
```

## 📝 Common Templates

### Approval Message

```markdown
✅ Approved! Welcome to the MagicMirror module list!

Your module will appear on https://modules.magicmirror.builders within 24 hours.

Thanks for your contribution! 🎉
```

### Request Minor Changes

```markdown
Thanks for your submission! This looks great overall. Just one small thing:

[SPECIFIC ISSUE]

Once fixed, I'll approve right away!
```

### Thank Top Contributors

```markdown
Thanks for another great module, @USERNAME!

I've added you to our trusted contributors team - your future submissions will be auto-approved after validation. Keep up the excellent work! 🌟
```

## 🎯 Best Practices

1. **Be responsive:** Try to review within 24-48 hours
2. **Be friendly:** Encourage new contributors
3. **Be clear:** Explain what needs to be fixed
4. **Trust the automation:** If validation passes, it's usually safe
5. **Recognize contributors:** Thank them, add to trusted team when appropriate
6. **Keep it simple:** Don't overthink - this should be quick

## ⏱️ Time Estimates

| Task                     | Estimated Time  |
| ------------------------ | --------------- |
| Review automated report  | 30 seconds      |
| Manual spot-check        | 1-2 minutes     |
| Approve & merge          | 30 seconds      |
| Request changes          | 2-3 minutes     |
| **Total per submission** | **3-5 minutes** |

## 📅 Maintenance Schedule

### Daily (5-10 minutes)

- Check for new submissions
- Review and approve/request changes

### Weekly (10 minutes)

- Review trusted contributor list
- Check for stuck/stale PRs
- Respond to any issues

### Monthly (30 minutes)

- Review submission stats
- Update documentation if needed
- Consider adding active contributors to trusted team

## 🚨 When to Escalate

**Contact other maintainers if:**

- Suspicious/malicious submission
- Legal/copyright concerns
- Technical issues with automation
- Community conflict

**How to contact:**

- GitHub Discussions
- Discord/Forum
- Direct message to @KristjanESPERANTO

## 📚 Quick Links

- [Submission Workflow Documentation](./module-submission-guide.md)
- [Module Submissions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/pulls?q=is%3Apr+label%3Amodule-submission)
- [Trusted Contributors Team](https://github.com/orgs/MagicMirrorOrg/teams/trusted-contributors)
- [GitHub Actions Workflows](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/actions)

---

**Questions?** Open an issue or reach out to @KristjanESPERANTO
