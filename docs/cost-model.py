"""Rough token-cost model for 4 ways of keeping track of "what's next" in a real project.

Everything below is an ASSUMPTION except the KanFlash overhead numbers, which come from
measured output sizes (chars / 4 ~ tokens). Ranges are (low, mode, high) for a triangular draw.
"""
import random
import statistics as st

random.seed(7)
N_RUNS = 20000

# project shape (a small real project, ~2 weeks of part-time work)
MSGS = 120      # user messages
TASKS = 25      # tasks / features
SESSIONS = 10   # times a new AI session is opened


def tri(r):
    return random.triangular(r[0], r[2], r[1])


# --- cost of "what's next?" WITHOUT a board: the AI rebuilds state (git log/status, reading files, summarising)
ASK_NO_BOARD = (2000, 4000, 9000)
# --- cost of the same question WITH a board: one `next`/`list` call + short answer
ASK_BOARD = (150, 250, 500)
# --- re-explaining the project state at a session start when nothing is stored
RESTATE_SESSION = (1500, 3000, 6000)

# --- drift: the AI works on the wrong / duplicated / low-priority thing and it is noticed late.
# chance per task, and tokens wasted when it happens (a task is ~20-30k tokens in total)
DRIFT_COST = (8000, 18000, 40000)
DRIFT_P = {
    1: (0.06, 0.10, 0.18),   # user asks every task: AI suggestion is reasonably guided but unverified
    2: (0.05, 0.08, 0.15),   # frequent re-checks catch drift earlier
    3: (0.15, 0.25, 0.40),   # nobody tracks anything across sessions
    4: (0.03, 0.06, 0.12),   # board is the shared memory; AI still misreads sometimes
}

# --- KanFlash overhead (measured sizes)
INSTR_SESSION = 300        # CLAUDE.local.md block (1 KB ~ 260-300 tokens), repeated each session
LIST_SESSION = (120, 250, 600)   # SessionStart `list` output; grows with cards
PROMPT_HOOK = (35, 45, 70)       # UserPromptSubmit one-liner, every user message
CLI_CALLS_PER_TASK = (4, 6, 9)   # list/start/check*/done, ~120 tokens per call incl. output
CALL_TOKENS = 120
STOP_FIRES = (0.03, 0.08, 0.15)  # fraction of turns where the Stop nudge triggers
STOP_COST = 700                  # nudge text + one extra short turn


def run(scn):
    total = 0.0
    parts = {"asking": 0.0, "restating": 0.0, "drift": 0.0, "kanflash": 0.0}
    asks = {1: TASKS, 2: MSGS // 5, 3: 0, 4: 0}[scn]
    for _ in range(asks):
        parts["asking"] += tri(ASK_NO_BOARD)
    if scn in (1, 2, 3):
        parts["restating"] += SESSIONS * tri(RESTATE_SESSION) * (0.5 if scn != 3 else 1.0)
    for _ in range(TASKS):
        if random.random() < tri(DRIFT_P[scn]):
            parts["drift"] += tri(DRIFT_COST)
    if scn == 4:
        k = SESSIONS * (INSTR_SESSION + tri(LIST_SESSION))
        k += MSGS * tri(PROMPT_HOOK)
        k += TASKS * tri(CLI_CALLS_PER_TASK) * CALL_TOKENS
        k += MSGS * tri(STOP_FIRES) * STOP_COST
        parts["kanflash"] = k
    total = sum(parts.values())
    return total, parts


def pct(xs, p):
    xs = sorted(xs)
    return xs[int(len(xs) * p)]


names = {
    1: "1 forgets, asks every time (no board)",
    2: "2 re-checks every 5 msgs (no board)",
    3: "3 never asks (no board)",
    4: "4 uses KanFlash, never asks",
}
res = {}
for s in (1, 2, 3, 4):
    runs = [run(s) for _ in range(N_RUNS)]
    tot = [r[0] for r in runs]
    res[s] = tot
    mean_parts = {k: st.mean(r[1][k] for r in runs) for k in runs[0][1]}
    print(f"{names[s]:42s} median {st.median(tot)/1000:6.1f}k   p10-p90 {pct(tot,.1)/1000:5.1f}k-{pct(tot,.9)/1000:5.1f}k"
          f"   | ask {mean_parts['asking']/1000:5.1f}k restate {mean_parts['restating']/1000:4.1f}k drift {mean_parts['drift']/1000:5.1f}k kanflash {mean_parts['kanflash']/1000:4.1f}k")

print()
for s in (1, 2, 3):
    saved = [a - b for a, b in zip(res[s], res[4])]
    wins = sum(1 for x in saved if x > 0) / len(saved)
    print(f"KanFlash vs {names[s]:40s}: median saving {st.median(saved)/1000:6.1f}k tokens "
          f"({st.median(saved)/st.median(res[s])*100:4.0f}%), p10-p90 {pct(saved,.1)/1000:6.1f}k..{pct(saved,.9)/1000:6.1f}k, cheaper in {wins*100:3.0f}% of runs")

# sensitivity: how big must drift be for KanFlash to break even vs scenario 1/2?
print("\nOverhead only (scenario 4, no drift):")
oh = [run(4)[1]["kanflash"] for _ in range(N_RUNS)]
print(f"  median {st.median(oh)/1000:.1f}k  p10-p90 {pct(oh,.1)/1000:.1f}k-{pct(oh,.9)/1000:.1f}k  (= {st.median(oh)/MSGS:.0f} tokens/message)")
