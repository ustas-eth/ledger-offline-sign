#!/usr/bin/env python3
"""Exercise actual terminal prompts with a non-signing fixture and render captures."""
import os
import subprocess
from pathlib import Path
import pexpect
import pyte
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "screenshots"
ADDRESS = "0x2222222222222222222222222222222222222222"
COLS, ROWS = 112, 44


class Capture:
    def __init__(self, child):
        self.screen = pyte.Screen(COLS, ROWS)
        self.screen.write_process_input = child.send
        self.stream = pyte.Stream(self.screen)
        self.text = ""

    def write(self, text):
        self.text += text
        self.stream.feed(text)

    def flush(self):
        pass


def render(screen, name):
    font_path = os.environ.get("SCREENSHOT_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")
    if not Path(font_path).exists():
        font_path = subprocess.check_output(["fc-match", "DejaVu Sans Mono", "-f", "%{file}"], text=True).strip()
    font = ImageFont.truetype(font_path, 17)
    width = int(font.getlength("M")) + 1
    height, padding = 24, 24
    image = Image.new("RGB", (COLS * width + padding * 2, ROWS * height + 72), "#111820")
    draw = ImageDraw.Draw(image)
    draw.text((padding, 15), "ledger-offline-sign · DEMO / simulated device", fill="#8999ae", font=font)
    palette = {"green": "#9cce8a", "cyan": "#84d2dc", "yellow": "#eac58d", "red": "#ef7d86", "blue": "#83b6f5", "magenta": "#bc9bec", "black": "#798da5", "brightblack": "#798da5"}
    for row in range(ROWS):
        for col in range(COLS):
            cell = screen.buffer[row][col]
            color = palette.get(cell.fg, "#dce6f5")
            if len(cell.fg) == 6:
                color = "#" + cell.fg
            draw.text((padding + col * width, 54 + row * height), cell.data, font=font, fill=color)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / name)
    print(f"Captured {name}")


def exercise(kind):
    child = pexpect.spawn("node", ["scripts/demo.mjs", *(["--lists"] if kind == "lists" else [])], cwd=str(ROOT), env={**os.environ, "TERM": "xterm-256color", "FORCE_COLOR": "1"}, encoding="utf-8", timeout=15, dimensions=(ROWS, COLS))
    child.delaybeforesend = 0.1
    capture = Capture(child)
    child.logfile_read = capture

    def answer(prompt, value="", downs=0):
        child.expect_exact(prompt)
        # Wait for the footer/cursor render to finish before sending a key.
        child.send("\x1b[B" * downs + value + "\r")

    try:
        answer("Ledger account")
        answer("Account index")
        if kind == "lists":
            answer("Network", "31337")
        elif kind == "custom":
            answer("Network", downs=8)
            answer("Chain ID (must support EIP-1559)", "31338")
        else:
            answer("Network")
        answer("Nonce (obtain it", "7")
        answer("Transaction", downs=1 if kind != "native" else 0)
        if kind == "custom":
            answer("Token (local metadata")
            answer("Token contract address", "0x3333333333333333333333333333333333333333")
            answer("Token decimals", "0")
        elif kind in ("token", "lists"):
            answer("Token (local metadata", "DEMO" if kind == "lists" else "")
        if kind != "native":
            answer("Token recipient", ADDRESS)
            answer("Amount in", "42" if kind in ("custom", "lists") else "12.345678")
        else:
            answer("Recipient address", ADDRESS)
            answer("Native value", "0.1 ether")
        answer("Priority fee per gas", "1 gwei")
        answer("Maximum total fee per gas", "20 gwei")
        answer("Gas limit (", "21000" if kind == "native" else "60000")
        child.expect_exact("Sign this exact transaction on the Ledger?")
        child.expect_exact("No")
        # Drain any remaining terminal drawing before capturing.
        try:
            while True:
                child.read_nonblocking(4096, timeout=0.2)
        except pexpect.TIMEOUT:
            pass
        plain = "\n".join(capture.screen.display)
        assert "Gas limit" in plain and "Execution cap" in plain
        if kind == "lists":
            assert "42 DEMO" in plain and "demo list" in plain
        if kind == "custom":
            assert "42 custom token" in plain and "0 decimals" in plain
        if kind == "token":
            assert "12.345678 USDC" in plain and ADDRESS in plain
            render(capture.screen, "review.png")
        child.send("\r")  # Signing defaults to No.
        child.expect_exact("Cancelled. No signing request was sent.")
        child.expect(pexpect.EOF)
        child.close()
        assert child.exitstatus == 0
        print(f"Terminal flow passed: {kind}")
    finally:
        child.close(force=True)


if __name__ == "__main__":
    for kind in ("native", "token", "custom", "lists"):
        exercise(kind)
