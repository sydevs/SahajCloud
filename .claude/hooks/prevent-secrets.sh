#!/bin/bash

# Prevent Secrets Hook (PreToolUse - Bash)
#
# Blocks git operations that might expose sensitive information.
# Scans for API keys, tokens, passwords, and other secrets.

# Read JSON from stdin
INPUT=$(cat)

# Extract command
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | sed 's/"command":"\(.*\)"/\1/')

# Only check git add and git commit commands
if [[ ! "$COMMAND" =~ git\ (add|commit) ]]; then
  exit 0
fi

# Get list of staged files
STAGED_FILES=$(cd "$CLAUDE_PROJECT_DIR" && git diff --cached --name-only --diff-filter=ACM 2>/dev/null)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Patterns to detect secrets
PATTERNS=(
  "PAYLOAD_SECRET"
  "DATABASE_URI"
  "S3_ACCESS_KEY"
  "S3_SECRET_ACCESS_KEY"
  "SMTP_PASS"
  "API_KEY"
  "PRIVATE_KEY"
  "[0-9a-f]{32,}"  # Long hex strings
  "Bearer [A-Za-z0-9_-]+"  # Bearer tokens
)

FOUND_SECRETS=false
DETAILS=""

# Check each staged file for secrets
while IFS= read -r FILE; do
  FULL_PATH="$CLAUDE_PROJECT_DIR/$FILE"

  # Skip .env.example files (they contain template placeholders, not real secrets)
  if [[ "$FILE" == *".env.example"* ]]; then
    continue
  fi

  # Skip binary files
  if file "$FULL_PATH" | grep -q "text"; then
    for PATTERN in "${PATTERNS[@]}"; do
      # Find matches but exclude commented lines and placeholder patterns
      MATCHES=$(grep -nE "$PATTERN" "$FULL_PATH" 2>/dev/null | \
                grep -v '^\s*#' | \
                grep -vE '(your-|example-|placeholder|xxxxx|00000|<your|<example)' | \
                head -3)

      if [ -n "$MATCHES" ]; then
        FOUND_SECRETS=true
        DETAILS="$DETAILS\n\n$FILE:\n$MATCHES"
      fi
    done
  fi
done <<< "$STAGED_FILES"

if [ "$FOUND_SECRETS" = true ]; then
  cat <<EOF
{
  "continue": false,
  "additionalContext": "🚨 SECURITY ALERT: Potential secrets detected in staged files. Please remove sensitive data before committing:$DETAILS\n\nConsider using .env files and ensure they are in .gitignore."
}
EOF
  exit 2  # Block operation
fi

exit 0
