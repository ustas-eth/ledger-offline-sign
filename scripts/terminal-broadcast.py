#!/usr/bin/env python3
"""Check the real broadcast prompts against a loopback-only RPC fixture."""
import json
import io
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pexpect

ROOT = Path(__file__).resolve().parents[1]
fixture = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", '''
import { Wallet, Transaction } from "ethers"
const wallet = Wallet.createRandom()
const tx = Transaction.from({ type: 2, chainId: 31337, nonce: 0, to: "0x2222222222222222222222222222222222222222", value: 0, gasLimit: 21000, maxFeePerGas: 2, maxPriorityFeePerGas: 1 })
tx.signature = wallet.signingKey.sign(tx.unsignedHash)
console.log(JSON.stringify({ serialized: tx.serialized, hash: tx.hash }))
'''], cwd=ROOT, text=True))
calls = []


class RPC(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        call = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        calls.append(call)
        assert call["method"] in ("eth_chainId", "eth_sendRawTransaction")
        if scenario in ("retry", "choose", "stop") and len(calls) == 1:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'{}')
            return
        result = "0x7a69" if call["method"] == "eth_chainId" else fixture["hash"]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"jsonrpc": "2.0", "id": call["id"], "result": result}).encode())


server = ThreadingHTTPServer(("127.0.0.1", 0), RPC)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    for scenario in ("decline", "approve", "retry", "choose", "stop"):
        calls.clear()
        with tempfile.TemporaryDirectory() as cache:
            child = pexpect.spawn("node", ["src/index.js", "--broadcast", "--local-only", "--no-cache"], cwd=str(ROOT), env={**os.environ, "XDG_CACHE_HOME": cache, "TERM": "xterm-256color"}, encoding="utf8", timeout=15, dimensions=(44, 112))
            child.delaybeforesend = 0.1
            output = io.StringIO()
            child.logfile_read = output

            def choose_rpc():
                child.expect_exact("Broadcast RPC (only the selected endpoint is checked)")
                child.send("Custom\r")
                child.expect_exact("RPC URL (hidden; not saved)")
                child.send(f"http://127.0.0.1:{server.server_port}/fixture-credential?token=hidden\r")

            try:
                child.expect_exact("Raw signed transaction (hidden; not saved)")
                child.send(fixture["serialized"] + "\r")
                child.expect_exact("Prepare broadcast?")
                child.expect_exact("Choose RPC")
                child.expect_exact("Keep offline")
                child.send("\x1b[D\r")
                choose_rpc()
                if scenario in ("retry", "choose", "stop"):
                    child.expect_exact("No signed transaction was sent.")
                    child.expect_exact("Signed transaction kept in memory. What next?")
                    child.send("\x1b[A" * {"retry": 2, "choose": 1, "stop": 0}[scenario] + "\r")
                    if scenario == "choose":
                        choose_rpc()
                approve = scenario in ("approve", "retry", "choose")
                if scenario != "stop":
                    child.expect_exact("Chain 31337 verified.")
                    child.expect_exact("Broadcast now")
                    child.expect_exact("Cancel")
                    assert all(call["method"] == "eth_chainId" for call in calls)
                    child.send("\x1b[D\r" if approve else "\r")
                    child.expect_exact("RPC accepted" if approve else "Not broadcast.")
                child.expect(pexpect.EOF)
                child.close()
                assert child.exitstatus == 0
                assert "fixture-credential" not in output.getvalue()
                assert "token=hidden" not in output.getvalue()
                assert fixture["serialized"] not in output.getvalue()
                checks = 2 if scenario in ("retry", "choose") else 1
                assert [call["method"] for call in calls] == ["eth_chainId"] * checks + (["eth_sendRawTransaction"] if approve else [])
                if approve:
                    assert calls[-1]["params"] == [fixture["serialized"]]
                assert not list(Path(cache).iterdir())
            finally:
                child.close(force=True)
        print(f"Terminal broadcast flow passed: {scenario}")
finally:
    server.shutdown()
    server.server_close()
