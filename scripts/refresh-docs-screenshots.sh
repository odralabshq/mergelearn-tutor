#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT=/home/adam/mergelearn-tutor
DEMO=/tmp/mergelearn-main-demo
PORT=4197
OUT="$REPO_ROOT/docs/assets/screenshots"
CLI="node $REPO_ROOT/dist/cli.js"
PW="npx --yes -p playwright playwright screenshot --browser chromium --viewport-size 1280,900 --full-page"

seed_demo() {
  rm -rf "$DEMO"
  mkdir -p "$DEMO/src/auth"
  cd "$DEMO"
  git init -b main
  git config user.email 'demo@mergelearn.local'
  git config user.name 'MergeLearn Demo'
  cat > src/auth/session.ts <<'EOF'
export type SessionEvent = { type: "login"; token: string } | { type: "logout" };
export async function validateSession(token: string): Promise<boolean> {
  return token.length > 0;
}
EOF
  git add .
  git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m 'add typed auth session'

  $CLI init --repo "$DEMO"
  $CLI concept add --repo "$DEMO" --id repo.session_flow --label 'Session flow' --term validateSession --path 'src/auth/*'
  $CLI ingest --repo "$DEMO" --since 365d
  $CLI course create --repo "$DEMO" --id learn-auth --title 'Learn auth' --goal 'Understand auth sessions' --materials 'src/auth/**' --docs 'docs/**'
  $CLI questions draft --repo "$DEMO" --course learn-auth --provider fake --count 2
  QID=$(node -e "const s=require('$DEMO/.skilltrace/state.json'); console.log(s.questionBank[0].id)")
  $CLI questions accept --repo "$DEMO" --id "$QID"
  $CLI cards generate --repo "$DEMO" --count 5 --mode more
  $CLI cards generate --repo "$DEMO" --course learn-auth --count 2
  $CLI study assign --repo "$DEMO" --seed demo --count 2
}

start_server() {
  if ss -ltnp 2>/dev/null | grep -q "127.0.0.1:$PORT "; then
    PID=$(ss -ltnp | sed -n "s/.*127.0.0.1:$PORT.*pid=\\([0-9]*\\).*/\\1/p" | head -1)
    if [ -n "${PID:-}" ]; then kill "$PID" || true; sleep 1; fi
  fi
  $CLI session --repo "$DEMO" --port "$PORT" >/tmp/mergelearn-session.log 2>&1 &
  echo $! >/tmp/mergelearn-session.pid
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$PORT/workbench" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo 'server failed to start' >&2
  cat /tmp/mergelearn-session.log >&2 || true
  exit 1
}

capture_one() {
  local file="$1"
  local route="$2"
  $PW "http://127.0.0.1:$PORT$route" "$OUT/$file"
  echo "captured $file"
}

capture() {
  mkdir -p "$OUT"
  capture_one workbench.png /workbench
  capture_one practice.png /practice
  capture_one map.png /map
  capture_one map-local-graph.png '/map?mode=local-graph'
  capture_one map-provenance.png '/map?mode=provenance'
  capture_one map-skill-map.png '/map?mode=skill-map'
  capture_one audit.png /audit
  capture_one plan.png /plan
  capture_one learning-path.png /learning-path
  capture_one review.png /
  capture_one courses.png /courses
  capture_one questions.png /questions
  capture_one timeline.png /timeline
  capture_one graph.png /graph
  capture_one history.png /history
  capture_one progress.png /progress
  capture_one preferences.png /preferences
  capture_one study.png /study
}

cd "$REPO_ROOT"
npm run build
seed_demo
start_server
npx --yes -p playwright playwright install chromium >/tmp/playwright-install.log 2>&1 || true
capture
if [ -f /tmp/mergelearn-session.pid ]; then kill "$(cat /tmp/mergelearn-session.pid)" 2>/dev/null || true; fi
echo 'screenshots done'
