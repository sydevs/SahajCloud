---
description: Draft a new GitHub issue or ticket
argument-hint: [issue-description]
allowed-tools: Bash(gh issue:*), Bash(gh pr:*), Bash(gh label:*), Bash(git branch:*), mcp__serena__*, Read, Glob, Grep
---

## Repository Context

- Recent issues: !`gh issue list --limit 10 --json number,title`
- Recent PRs: !`gh pr list --limit 5 --json number,title`
- Current sprint: !`gh issue list --label "sprint" --json number,title`
- Project labels: !`gh label list --json name`

## Your Task

You are an expert in prompt engineering, specializing in optimizing AI code assistant instructions. Your task is to write a new GitHub issue.

# Issue Contents
Write the GitHub issue according to the following description: $ARGUMENTS

# Procedure
1. Examine the issue contents and come up with a detailed implementation plan.
2. Look at the pull request history and identify any related past work.
3. Search payloadcms.com using a proxy and the internet for relevant details for the implementation.
3. Ask me questions to clarify the details of the issue.
4. Write a detailed issue description which takes into account testing and best practices. Remember that our project uses Payload CMS, and the solutions should use Payload's systems where possible.
5. Present the detailed issue description to me for approval.
6. Once approved, create a new issue on GitHub with the description.
