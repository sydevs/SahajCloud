Please analyze and fix the GitHub issue: $ARGUMENTS.

Follow these steps:

# PLAN

1. Use `gh issue view` to get the issue details
2. Understand the problem described in the issue
3. Ask clarifying questions if needed
4. Understand the prior art for this issue
   - Search the scratchpads for previous thoughts related to the issue
   - Search PRs to find history related to the issue
   - Search the codebase for related patterns and use similar solutions when planning
   - Search the (Payload CMS documentation)[https://payloadcms.com/docs/] for information that could help implement this feature
5. Think harder about how to break the issue down into a series of small, manageable tasks
6. Ask me for clarification on any questions you might have.

# CREATE

6. Create a new branch for the issue
7. Solve the issue in small manageable steps, according to your plan
8. Commit your changes after each step. Run `pnpm run generate:types` before each commit.

# TEST

9.  Use puppeteer via MCP to test your changes if you have made any UI changes
10. Think hard about what changes need testing. Create a list of test cases and then ask me to approve which areas should be tested.
11. Write tests for the approved tests. Examine testHelper.ts and make use of helper methods found within where appropriate. If adding or modifying collections, update testHelper.ts to match the new changes.
12. Run the full test suite to ensure you haven't broken anything
13. If tests fail, fix them and repeat steps 9-11
14. Ensure that all tests pass before continuing
15. Run `pnpm build` and ensure that all errors are fixed. You should also fix warnings if possible.

# DEPLOY

15. Update CLAUDE.md to reflect changes to the architecture.
16. Open a PR from this branch into master and request a review from Ardnived. The PR should include "Closes #$ARGUMENTS" so that it closes this issue.

# ADDITIONAL INSTRUCTIONS
- Remember to use the GitHub CLI (`gh`) for all GitHub-related tasks.
