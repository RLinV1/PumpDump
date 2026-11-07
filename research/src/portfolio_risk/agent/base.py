"""Shared agent result type."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentResult:
    """Outcome of one agent run.

    answer:     the final natural-language response.
    tool_calls: ordered [{name, input, output}] for every tool used; the service builds sources from it and the
                eval harness checks tool selection and numbers against it.
    llm:        which agent answered: "gemini" or "mock". Shown to the user.
    note:       set when the answer is not what was asked for (for example Gemini failed and the mock agent answered).
    """

    answer: str
    tool_calls: list[dict] = field(default_factory=list)
    llm: str = "mock"
    note: str = ""

    def tool_names(self) -> list[str]:
        return [c["name"] for c in self.tool_calls]
