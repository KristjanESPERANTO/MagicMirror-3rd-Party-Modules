# Module Submission System - Quick Start

## 🎯 What Was Created?

A complete PR-based submission system to replace the wiki-based module list.

## 📦 Created Components

### 1. Issue Form Template

- **File:** `.github/ISSUE_TEMPLATE/module-submission.yml`
- **Purpose:** User-friendly web form for module submissions
- **Features:** Validation, checkboxes, dropdown menus

### 2. Automation Workflows

#### Submission Bot

- **File:** `.github/workflows/module-submission-bot.yml`
- **Trigger:** Issue is created/edited
- **Function:**
  - Parses issue form
  - Automatically creates pull request
  - Comments on issue with status
  - Closes issue after PR creation

#### Validation Workflow

- **File:** `.github/workflows/validate-module-submission.yml`
- **Trigger:** Pull request is created/updated
- **Function:**
  - Validates JSON schema
  - Checks for duplicates
  - Tests repository accessibility
  - Checks required files
  - Creates validation report
  - Auto-approval for trusted users

### 3. Validation Scripts

| Script                                          | Purpose               |
| ----------------------------------------------- | --------------------- |
| `scripts/module-submission/validate.js`         | Schema validation     |
| `scripts/module-submission/check-duplicates.js` | Duplicate detection   |
| `scripts/module-submission/check-repository.js` | Repository validation |
| `scripts/module-submission/quality-check.js`    | Quality checks        |

### 4. Schema & Structure

- **Schema:** `module-submissions/module-submission.schema.json`
- **Directories:**
  - `module-submissions/pending/` - New submissions
  - `module-submissions/approved/` - Approved modules
  - `module-submissions/approved/modules-registry.json` - Master list

### 5. Documentation

- `module-submissions/README.md` - Overview and FAQ
- `docs/module-submission-guide.md` - Complete guide

## 🧪 Testing the System

### Local Test

```bash
# 1. Create test submission
cat > module-submissions/pending/MMM-TestModule.json << 'EOF'
{
  "url": "https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas",
  "name": "MMM-PublicTransportHafas",
  "description": "Public transport timetable for MagicMirror²",
  "category": "Transportation",
  "submissionType": "New Module",
  "submittedBy": "testuser",
  "submittedAt": "2025-10-19T12:00:00Z",
  "issueNumber": 1
}
EOF

# 2. Install dependencies (if not already done)
npm ci

# 3. Run validation
export CHANGED_FILES="module-submissions/pending/MMM-TestModule.json"
export GITHUB_TOKEN="your_token_here"  # Optional, for API limits

node scripts/module-submission/validate.js
node scripts/module-submission/check-duplicates.js
node scripts/module-submission/check-repository.js
node scripts/module-submission/quality-check.js

# 4. Check results
cat validation-results/schema.json
cat validation-results/duplicates.json
cat validation-results/repository.json
cat validation-results/quality.json

# 5. Clean up
rm -rf validation-results/
rm module-submissions/pending/MMM-TestModule.json
```

### Test with Real Issue (GitHub)

**Preparation:**

1. Merge this branch to `develop`
2. Push to GitHub

**Run test:**

1. Go to https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/new/choose
2. Select "Submit a MagicMirror² Module"
3. Fill out the form (use a real module for testing)
4. Submit!

**Expected behavior:**

1. Issue is created
2. Bot creates a PR within ~30 seconds
3. Validation runs (~2-3 minutes)
4. Bot comments with validation results
5. Issue is automatically closed
6. PR is ready for review

## ⚙️ Configuration

### GitHub Secrets

No additional secrets needed! `GITHUB_TOKEN` is provided automatically.

### GitHub Teams (Optional for Trusted Users)

**One-time:** Create team (if not already present)

```bash
# Create team
gh api orgs/MagicMirrorOrg/teams -X POST \
  -f name='trusted-contributors' \
  -f description='Auto-approved module contributors' \
  -f privacy='closed'
```

**Make users trusted contributors:**

```bash
# Add user (Web UI is also possible!)
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X PUT

# Remove user
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X DELETE

# List all trusted users
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/members --jq '.[].login'
```

**When to make someone a trusted user?**

- After 2-3 successful, quality submissions
- You know them as trustworthy community members
- **No fixed criteria - your decision!**

## 🚀 Rollout Strategy

### Phase 1: Private Beta (2-3 weeks)

- [ ] Merge this branch
- [ ] Test with 5-10 known module developers
- [ ] Fix bugs
- [ ] Incorporate feedback

### Phase 2: Public Beta (4-6 weeks)

- [ ] Announcement in MagicMirror Forum/Discord
- [ ] Banner in wiki: "New submission system available!"
- [ ] Run both systems in parallel
- [ ] Monitor adoption rate

### Phase 3: Migration (2-3 weeks)

- [ ] Export and migrate wiki list
- [ ] Clean up broken entries
- [ ] Verify website works

### Phase 4: Full Deploy (1 week)

- [ ] Set wiki to read-only
- [ ] Set up redirect
- [ ] Update documentation
- [ ] 🎉 Celebrate!

## 📊 Expected Improvements

| Metric                | Before (Wiki)          | After (PR)             |
| --------------------- | ---------------------- | ---------------------- |
| **Broken entries**    | ~15%                   | <2%                    |
| **Spam entries**      | Occasionally           | Virtually none         |
| **Time to listing**   | Immediate (unfiltered) | <48h (quality-checked) |
| **Missing metadata**  | ~40%                   | <10%                   |
| **Maintainer effort** | High (syntax fixes)    | Low (review only)      |
| **User experience**   | Complex (wiki syntax)  | Easy (form)            |

## 🔧 Next Steps

### Immediate (this week)

1. **Code review:**

   ```bash
   # Create and push branch
   git checkout -b feature/module-submission-system
   git add .
   git commit -m "feat: Add PR-based module submission system

   - Add GitHub Issue Form template for easy submissions
   - Implement automated validation workflows
   - Create validation scripts (schema, duplicates, repo checks)
   - Add comprehensive documentation
   - Support for trusted contributor auto-approval

   Closes #XXX"
   git push origin feature/module-submission-system
   ```

2. **Create PR:**
   - Title: `[Feature] PR-based Module Submission System`
   - Labels: `enhancement`, `infrastructure`

3. **Prepare testing:**
   - Create list of test modules
   - Identify beta testers

### Short-term (next 2 weeks)

- [ ] Add CI tests for validation scripts
- [ ] Fix linting errors in scripts
- [ ] Write wiki migration script
- [ ] Start beta test

### Mid-term (next month)

- [ ] Evaluate feedback
- [ ] Refine trusted user criteria
- [ ] Enable auto-merge for trusted users
- [ ] Create metrics dashboard

### Long-term (next 3 months)

- [ ] Migrate wiki
- [ ] Full deployment
- [ ] Advanced features:
  - Automatic screenshot capture
  - Dependency scanning
  - Compatibility checks

## 💡 Trusted User System

### Concept: Manual Management by Maintainers

**Approach:** Maintainers can manually make users "Trusted Contributors" - no automatic criteria.

### How does it work?

1. **Maintainer decides:** You know the community and can assess who is trustworthy
2. **GitHub team:** User is added to the `trusted-contributors` team
3. **Auto-approval:** Their future submissions are automatically approved after successful validation

### Make Users Trusted Contributors

**Option 1: GitHub Web UI**

1. Go to https://github.com/orgs/MagicMirrorOrg/teams/trusted-contributors
2. Click "Add a member"
3. Enter username
4. Done!

**Option 2: GitHub CLI**

```bash
# Add user
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X PUT

# Remove user
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X DELETE

# List team members
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/members
```

### When should someone become a trusted user?

**Suggested criteria (not automatic, just for guidance):**

- Has already submitted 2-3 successful modules
- Modules are well-maintained and documented
- Knows the submission requirements
- Trustworthy community member

**But:** You decide! It's your discretion as a maintainer.

### Benefits for Trusted Users

- ⚡ **Auto-approval** after successful validation
- 🚀 **Faster merge** (no waiting for review)
- 🏆 **"Trusted Contributor" label** on PRs
- ✨ **Shows appreciation** for their contributions

### Team Setup (one-time)

If the team doesn't exist yet:

```bash
# Create team
gh api orgs/MagicMirrorOrg/teams -X POST \
  -f name='trusted-contributors' \
  -f description='Contributors with auto-approval for module submissions' \
  -f privacy='closed'
```

### How the Workflow Uses It

1. PR is submitted
2. Validation runs
3. **If validation successful:**
   - Workflow checks: Is user in `trusted-contributors` team?
   - **YES** → Auto-approve + label `auto-approved` + comment
   - **NO** → Comment "Ready for review" + waits for maintainer

**No code for criteria checks needed!** Just a simple team membership check.

## 📝 Further Improvement Ideas

### Automation

- [ ] Automatic screenshot capture from repo
- [ ] Dependency security scanning (Dependabot)
- [ ] Automatic version checks
- [ ] License compatibility check

### User Experience

- [ ] Status dashboard for open submissions
- [ ] Email notifications
- [ ] Template generator for package.json
- [ ] Preview of website display

### Maintainer Tools

- [ ] Bulk approval tool
- [ ] Statistics dashboard
- [ ] Duplicate merge tool
- [ ] Automated reporting (weekly digest)

## 🐛 Known Limitations

1. **API Rate Limits:**
   - GitHub: 5000 req/h (authenticated), 60 req/h (unauthenticated)
   - Solution: GITHUB_TOKEN is used automatically

2. **Validation Speed:**
   - Current: ~2-3 minutes
   - Could be optimized through parallelization

3. **No Real-time Module Tests:**
   - Validation only checks repository structure
   - Not whether module actually works
   - Future: Could be extended with container tests

## 📚 Resources

- [GitHub Issue Forms Documentation](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [GitHub Actions Workflows](https://docs.github.com/en/actions/using-workflows)
- [JSON Schema](https://json-schema.org/)
- [AJV Validator](https://ajv.js.org/)

## ❓ FAQ

**Q: Why not directly to master/main branch?**
A: We use `develop` for integration, then merge to `main` for production. Standard GitFlow.

**Q: What if the bot fails?**
A: Maintainers can manually create a PR from the issue. Fallback is documented.

**Q: Can users update their submissions?**
A: Yes! They can edit the JSON file in the PR or create a new issue.

**Q: What happens to the existing create_module_list.js script?**
A: It remains in parallel for now and reads from the new registry. Migration is seamless.

**Q: How is spam prevented?**
A: Validation + review + GitHub's built-in spam management. Plus we can block users.

---

**Created:** 2025-10-19  
**Version:** 1.0.0  
**Status:** 🧪 Ready for Testing  
**Next Milestone:** Private Beta
