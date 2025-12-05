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
  # Removed: "Bearer [A-Za-z0-9_-]+" - Too many false positives with template variables
)

FOUND_SECRETS=false
DETAILS=""

# Check each staged file for secrets
while IFS= read -r FILE; do
  FULL_PATH="$CLAUDE_PROJECT_DIR/$FILE"

  # Skip example/template files (they contain variable names, not actual secrets)
  if [[ "$FILE" == *.example ]] || [[ "$FILE" == *.template ]] || [[ "$FILE" == *.sample ]]; then
    continue
  fi

  # Skip documentation files (they document environment variables)
  if [[ "$FILE" == *.md ]]; then
    continue
  fi

  # Skip TypeScript type definition files (they declare types for environment variables)
  if [[ "$FILE" == *.d.ts ]]; then
    continue
  fi

  # Skip the hook itself (it contains pattern strings)
  if [[ "$FILE" == *"prevent-secrets.sh" ]]; then
    continue
  fi
  
  # Skip .env.example files (they contain template placeholders, not real secrets)
  if [[ "$FILE" == *".env.example"* ]]; then
    continue
  fi

  # Skip binary files
  if file "$FULL_PATH" | grep -q "text"; then
    for PATTERN in "${PATTERNS[@]}"; do
      # Skip if it's an environment variable reference (process.env.PATTERN_NAME)
      if grep -qE "$PATTERN" "$FULL_PATH" 2>/dev/null; then
        # Check if matches are environment variable references
        MATCHES=$(grep -nE "$PATTERN" "$FULL_PATH" 2>/dev/null)

        # Filter out process.env.* references
        FILTERED_MATCHES=$(echo "$MATCHES" | grep -vE "process\.env\.[A-Z_]+")

        if [ -n "$FILTERED_MATCHES" ]; then
          FOUND_SECRETS=true
          DETAILS="$DETAILS\n\n$FILE:\n$(echo "$FILTERED_MATCHES" | head -3)"
        fi
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
