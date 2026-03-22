# Module Submission System

This directory contains the infrastructure for the new PR-based module submission workflow.

## 🎯 Goal

Replace the wiki-based module list with a modern, quality-controlled submission process using GitHub Pull Requests.

## 📁 Directory Structure

```text
module-submissions/
├── pending/              # New submissions awaiting validation
├── approved/             # Approved modules
│   └── modules-registry.json
├── module-submission.schema.json
└── README.md            # This file
```

## 🚀 How It Works

### For Module Developers

**Option 1: Web Form (Easiest)**

1. Go to [Issues → New Issue](../../issues/new/choose)
2. Select "Submit a MagicMirror² Module"
3. Fill out the form
4. Submit!

Our bot will automatically:

- Create a Pull Request from your submission
- Run validation checks
- Notify you of the status

**Option 2: Direct Pull Request (Advanced)**

1. Fork this repository
2. Create a JSON file in `module-submissions/pending/`
3. Follow the schema in `module-submission.schema.json`
4. Open a Pull Request to `develop` branch

### For Maintainers

When a submission comes in:

1. **Automated checks run automatically:**
   - JSON schema validation
   - Duplicate detection
   - Repository accessibility check
   - Required files check (package.json, LICENSE, README)
   - License validation
   - Quality checks

2. **Review the PR:**
   - Check the automated validation report comment
   - Review the module manually if needed
   - Request changes if necessary

3. **Approve & Merge:**
   - Once all checks pass, approve the PR
   - Merge to `develop`
   - Module appears on website within 24 hours

## 🤖 Automation Features

### Automatic Validation

All submissions are automatically checked for:

- ✅ Valid JSON schema
- ✅ No duplicates
- ✅ Repository exists and is accessible
- ✅ Contains `package.json` with valid license
- ✅ Contains LICENSE file
- ✅ Contains README.md
- ✅ Uses MMM-\* naming convention (recommended)
- ✅ Has screenshot (recommended)

### Trusted Contributors

**Simple approach:** Maintainers manually add reliable contributors to a GitHub team.

**How to become trusted:**

- There are no automatic criteria
- Maintainers grant this status based on contribution quality and reliability
- Typically after 2-3 successful module submissions

**Benefits:**

- ⚡ Auto-approval after validation passes
- 🚀 Faster merge times
- � Recognition as a trusted community member

**For maintainers:**

```bash
# Add user to trusted team
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X PUT

# Remove user
gh api orgs/MagicMirrorOrg/teams/trusted-contributors/memberships/USERNAME -X DELETE
```

## 📊 Validation Schema

All submissions must conform to this schema:

```json
{
  "url": "https://github.com/username/MMM-ModuleName",
  "name": "MMM-ModuleName",
  "description": "Brief description of what the module does",
  "category": "Category name",
  "submissionType": "New Module" | "Update Existing Module",
  "additionalInfo": "Optional additional context",
  "submittedBy": "github-username",
  "submittedAt": "2025-10-19T12:00:00Z",
  "issueNumber": 123
}
```

See `module-submission.schema.json` for the complete schema.

## 🧪 Testing the System

To test the submission system locally:

1. **Create a test submission:**

   ```bash
   echo '{
     "url": "https://github.com/test/MMM-TestModule",
     "name": "MMM-TestModule",
     "description": "Test module for validation",
     "category": "Testing",
     "submissionType": "New Module",
     "submittedBy": "testuser",
     "submittedAt": "2025-10-19T12:00:00Z",
     "issueNumber": 1
   }' > module-submissions/pending/MMM-TestModule.json
   ```

2. **Run validation scripts:**

   ```bash
   export CHANGED_FILES="module-submissions/pending/MMM-TestModule.json"
   node scripts/module-submission/validate.ts
   node scripts/module-submission/check-duplicates.ts
   node scripts/module-submission/check-repository.ts
   node scripts/module-submission/quality-check.ts
   ```

3. **Check results:**
   ```bash
   cat validation-results/schema.json
   cat validation-results/duplicates.json
   cat validation-results/repository.json
   cat validation-results/quality.json
   ```

## 📝 Migration Plan

### Phase 1: Parallel Testing (Current)

- ✅ Submission system infrastructure created
- ✅ GitHub Issue Form template ready
- ✅ Automated validation workflows configured
- ⏳ Testing with selected modules
- ⏳ Gathering feedback from early adopters

### Phase 2: Soft Launch

- 📢 Announce new submission system
- 📖 Update documentation
- 🔗 Add links from wiki to new system
- ✅ Accept submissions through both methods
- 📊 Monitor success rate and user feedback

### Phase 3: Migration

- 🔄 Migrate existing modules from wiki
- 📧 Contact module authors for updates
- 🎯 Mark wiki as "legacy" with redirect

### Phase 4: Full Deployment

- 🚫 Close wiki for new submissions
- ✅ All submissions through PR workflow only
- 🎉 Celebrate modernization!

## 🛠️ Scripts

| Script                | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `validate.js`         | Validates JSON against schema                       |
| `check-duplicates.js` | Checks for duplicate submissions                    |
| `check-repository.js` | Validates repository accessibility and contents     |
| `quality-check.js`    | Performs quality checks (naming, screenshots, etc.) |

## 🔍 Workflow Files

| Workflow                         | Trigger             | Purpose                    |
| -------------------------------- | ------------------- | -------------------------- |
| `module-submission-bot.yml`      | Issue opened/edited | Creates PR from issue form |
| `validate-module-submission.yml` | PR opened/updated   | Runs validation checks     |

## 📚 Resources

- [JSON Schema Documentation](https://json-schema.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [MagicMirror² Documentation](https://docs.magicmirror.builders/)

## ❓ FAQ

**Q: Why replace the wiki?**
A: The wiki lacks quality control, validation, and review processes. This leads to broken entries and spam.

**Q: Is this harder for module developers?**
A: No! We provide a simple web form that's actually easier than editing wiki syntax.

**Q: What happens to existing wiki entries?**
A: They'll be migrated automatically and remain accessible.

**Q: Can I still update my module info?**
A: Yes! Submit an "Update Existing Module" through the same process.

**Q: How long does approval take?**
A: Usually 24-48 hours. Trusted contributors get faster approval.

## 🤝 Contributing

Improvements to the submission system are welcome! Please:

1. Test changes locally
2. Update documentation
3. Add tests if adding new validation
4. Open a PR to `develop`
