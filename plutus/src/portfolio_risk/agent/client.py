"""Assistant entry point: Gemini with function calling over the MCP tools, or the rule-based mock agent.

``USE_MOCK_LLM=auto`` (default) uses the mock agent unless ``GEMINI_API_KEY`` is set. The Gemini path starts the MCP
server over stdio, lists its tools, and runs a bounded loop with the official ``google-genai`` SDK: the model may ask for
tools for at most ``MAX_TOOL_STEPS`` turns, the whole run has a timeout, and only the read-only tools are exposed.
If Gemini fails, the mock agent answers and the result says so.

CLI:  python -m portfolio_risk.agent.client "Is GME being pumped?"
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Awaitable, Callable

from .. import config, tools
from .base import AgentResult
from .prompts import SYSTEM_PROMPT


def run_agent(question: str, paper_token: str = "") -> AgentResult:
    """Synchronous entry point. ``paper_token`` binds the asker's paper account to the read-only paper tools."""
    tools.set_paper_token(paper_token)
    if config.use_mock_llm():
        from . import mock_agent

        return mock_agent.run(question)
    try:
        return asyncio.run(asyncio.wait_for(_run_gemini(question, paper_token), config.ASSISTANT_TIMEOUT_SEC))
    except Exception as exc:  # noqa: BLE001  (any Gemini or MCP failure falls back; the type name is the only detail kept)
        print(f"gemini agent failed: {type(exc).__name__}", file=sys.stderr)
        from . import mock_agent

        result = mock_agent.run(question)
        result.note = "Gemini was unavailable, so the rule-based mock agent answered."
        return result


MAX_CALLS_PER_TURN = 4
CallTool = Callable[[str, dict], Awaitable[dict]]


async def gemini_loop(client, declarations: list, call_tool: CallTool, question: str, model: str, max_steps: int = config.MAX_TOOL_STEPS) -> AgentResult:
    """The bounded tool-use loop. ``client`` is a ``google.genai.Client`` (or a fake with the same ``aio.models`` shape)."""
    from google.genai import types

    cfg = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT, temperature=0.2, max_output_tokens=1200,
        tools=[types.Tool(function_declarations=declarations)],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),  # we run the loop, so it is bounded
    )
    contents = [types.Content(role="user", parts=[types.Part.from_text(text=question)])]
    calls: list[dict] = []
    for _ in range(max_steps):
        resp = await client.aio.models.generate_content(model=model, contents=contents, config=cfg)
        requested = list(resp.function_calls or [])
        if not requested:
            return AgentResult(answer=(resp.text or "").strip(), tool_calls=calls, llm="gemini")
        contents.append(resp.candidates[0].content)  # keeps the model turn exactly as returned (thought signatures included)
        parts = []
        for i, fc in enumerate(requested):
            args = dict(fc.args or {})
            out = await call_tool(fc.name, args) if i < MAX_CALLS_PER_TURN else {"error": "too many tool calls in one turn"}
            calls.append({"name": fc.name, "input": args, "output": out})
            parts.append(types.Part.from_function_response(name=fc.name, response={"result": out}))
        contents.append(types.Content(role="user", parts=parts))
    # Out of steps: ask once more with tools off so the user still gets an answer from what was gathered.
    cfg.tools = None
    cfg.automatic_function_calling = None
    resp = await client.aio.models.generate_content(model=model, contents=contents, config=cfg)
    return AgentResult(answer=(resp.text or "").strip(), tool_calls=calls, llm="gemini")


async def _run_gemini(question: str, paper_token: str) -> AgentResult:
    from google import genai
    from google.genai import types
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    # The key stays in this process: the tool subprocess gets the environment without it.
    env = {k: v for k, v in os.environ.items() if k != "GEMINI_API_KEY"}
    env["PLUTUS_PAPER_TOKEN"] = paper_token
    server = StdioServerParameters(command=sys.executable, args=["-m", "portfolio_risk.server.mcp_server"], env=env)
    client = genai.Client(api_key=config.gemini_api_key())

    async with stdio_client(server) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        listed = (await session.list_tools()).tools
        declarations = [
            types.FunctionDeclaration(name=t.name, description=t.description or "", parameters_json_schema=t.inputSchema)
            for t in listed if t.name in tools.READ_ONLY_TOOLS
        ]
        allowed = {d.name for d in declarations}

        async def call_tool(name: str, args: dict) -> dict:
            if name not in allowed:
                return {"error": "unknown tool"}
            res = await session.call_tool(name, args)
            if res.structuredContent is not None:
                return res.structuredContent
            text = "".join(getattr(c, "text", "") for c in res.content)
            try:
                return json.loads(text)
            except ValueError:
                return {"error": text[:200] or "tool failed"}

        return await gemini_loop(client, declarations, call_tool, question, config.gemini_model())


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python -m portfolio_risk.agent.client "your question"')
        raise SystemExit(2)
    result = run_agent(" ".join(sys.argv[1:]))
    print(f"[answered by: {result.llm}]\n")
    if result.tool_calls:
        print("Tools used: " + ", ".join(result.tool_names()) + "\n")
    print(result.answer)


if __name__ == "__main__":
    main()
