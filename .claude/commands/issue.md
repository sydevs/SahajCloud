Please analyze and fix the GitHub issue: $ARGUMENTS.

Follow these steps:

# PLAN

1. Use `gh issue view` to get the issue details
2. Understand the problem described in the issue
3. Ask clarifying questions if needed
4. Understand the prior art for this issue
   - Search the scratchpads for previous thoughts related to the issue
   - Search PRs to find history related to the issue
   - Search the codebase for related issues
   - Search the (Payload CMS documentation)[https://payloadcms.com/docs/] for information that could help implement this feature
5. Think harder about how to break the issue down into a series of small, manageable tasks

# CREATE

6. Create a new branch for the issue
7. Solve the issue in small manageable steps, according to your plan
8. Commit your changes after each step.

# TEST

9.  Use puppeteer via MCP to test your changes if you have made any UI changes
10. Write tests to describe the expected behavior of your changes
11. Run the full test suite to ensure you haven't broken anything
12. If tests fail, fix them and repeat steps 9-11
13. Ensure that all tests pass before continuing

# DEPLOY

14. Open a PR from this branch into master and request a review from Ardnived

Remember to use the GitHub CLI (`gh`) for all GitHub-related tasks.
