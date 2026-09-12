"""Self-test for `interactive.py`. Run it after touching that driver.

    python3 .claude/skills/payload-cli/test_interactive.py

Nothing in CI runs this. It exists because the driver has now shipped four
silent bugs, and every one of them looked like success from the shell: the
run hung, the caller's `timeout` killed it, and the log said nothing about
why. Each case drives the real driver over a real PTY against a fake child,
so no database and no schema change are needed.

To watch a case fail, reintroduce the defect it covers — drop the `ANSI.sub`
on the match line for the first, or the `give_up` call for the second — and
re-run.
"""

import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import types

HERE = pathlib.Path(__file__).resolve().parent
DRIVER = HERE / 'interactive.py'
REPO_ROOT = HERE.parent.parent.parent
LOG_PATH = pathlib.Path('/tmp/payload-pty.log')

# The bytes a coloured rename prompt actually puts on the PTY, copied from a
# real `/tmp/payload-pty.log`. chalk's escapes sit inside the column and
# table names, which is exactly what the old `\w+` could not span.
COLOURED_PROMPT = (
    'Is \\x1b[1m\\x1b[34mcommon_chrome\\x1b[39m\\x1b[22m column in '
    '\\x1b[1m\\x1b[34msy_atlas_translations_locales\\x1b[39m\\x1b[22m table '
    'created or renamed from another column?'
)

failures = []


def check(name, condition, detail=''):
    print(f'{"ok  " if condition else "FAIL"}  {name}')
    if not condition:
        failures.append(f'{name}: {detail}')


def run(script, env=None, timeout=120):
    """Run the driver against one fake child. Never raises on a hang."""
    environ = dict(os.environ)
    environ.update(env or {})
    proc = subprocess.Popen(
        [sys.executable, str(DRIVER), script],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environ,
        start_new_session=True,
    )
    timed_out = False
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        # Its own session, so this reaps the node grandchild too.
        timed_out = True
        os.killpg(proc.pid, signal.SIGKILL)
        out, err = proc.communicate()
    result = types.SimpleNamespace(
        returncode=proc.returncode, stdout=out, stderr=err, timed_out=timed_out
    )
    return result, LOG_PATH.read_text(errors='replace')


def test_answers_a_coloured_prompt():
    """The fourth bug: chalk's escapes broke the rename-vs-create regex."""
    proc, log = run(
        f'process.stdout.write("{COLOURED_PROMPT}\\n")\n'
        'process.stdin.once("data", () => (process.stdout.write("\\nANSWERED\\n"), process.exit(0)))\n'
        'setTimeout(() => process.exit(9), 20000)\n'
    )
    check('coloured prompt: driver exits 0', proc.returncode == 0, proc.stderr)
    check('coloured prompt: answered it', '[pty] answered `common_chrome` on sy_atlas_translations_locales' in log, log[-400:])
    check('coloured prompt: child saw the answer', 'ANSWERED' in log, log[-400:])
    check('coloured prompt: log keeps the raw escapes', '\x1b[34mcommon_chrome' in log, log[:200])


def test_gives_up_on_a_prompt_it_cannot_parse():
    """An unparseable prompt ends the run, rather than waiting for `timeout`."""
    proc, log = run(
        'process.stdout.write("Is the schema quite ready?\\n")\n'
        'setInterval(() => 0, 100000)\n',
        env=dict(PAYLOAD_PTY_STALL_SECONDS='3'),
        timeout=60,
    )
    check('unparsed prompt: driver ended on its own', not proc.timed_out, 'it hung instead')
    check('unparsed prompt: exits non-zero', proc.returncode != 0, str(proc.returncode))
    check('unparsed prompt: says what went wrong', 'could not parse' in proc.stderr, proc.stderr)
    check('unparsed prompt: quotes what it saw', 'quite ready?' in proc.stderr, proc.stderr)
    check('unparsed prompt: records it in the log', 'gave up' in log, log[-400:])


def test_does_not_give_up_on_a_prompt_it_answered():
    """Drizzle re-renders an answered prompt, and the echo stays in `buf`."""
    proc, log = run(
        f'process.stdout.write("{COLOURED_PROMPT}\\n")\n'
        f'process.stdin.once("data", () => process.stdout.write("{COLOURED_PROMPT}\\n"))\n'
        'setTimeout(() => process.exit(0), 9000)\n',
        env=dict(PAYLOAD_PTY_STALL_SECONDS='3'),
        timeout=60,
    )
    check('answered echo: driver exits 0', proc.returncode == 0, proc.stderr)
    check('answered echo: did not give up', 'gave up' not in proc.stderr, proc.stderr)
    check('answered echo: log records no give-up', 'gave up' not in log, log[-400:])


def test_honours_the_cwd_override():
    """PAYLOAD_PTY_CWD lets a copy of this driver run from outside the repo."""
    with tempfile.TemporaryDirectory() as tmp:
        os.symlink(REPO_ROOT / 'node_modules', pathlib.Path(tmp) / 'node_modules')
        proc, log = run(
            'process.stdout.write("cwd=" + process.cwd() + "\\n")\nprocess.exit(0)\n',
            env=dict(PAYLOAD_PTY_CWD=tmp),
            timeout=60,
        )
        check('cwd override: driver exits 0', proc.returncode == 0, proc.stderr)
        check('cwd override: child ran there', 'cwd=' + os.path.realpath(tmp) in log, log[-400:])


for case in (
    test_answers_a_coloured_prompt,
    test_gives_up_on_a_prompt_it_cannot_parse,
    test_does_not_give_up_on_a_prompt_it_answered,
    test_honours_the_cwd_override,
):
    case()

if failures:
    print(f'\n{len(failures)} failure(s):')
    for failure in failures:
        print(f'  - {failure}')
    sys.exit(1)
print('\nall checks passed')
