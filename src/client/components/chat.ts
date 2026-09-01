/**
 * Conversational chat view.
 *
 * Renders the running conversation as chat bubbles and a message composer at the
 * bottom. The agent's follow-up questions become bubbles with optional
 * quick-reply buttons; a triage result becomes an embedded Level 1/2/3 card.
 *
 * This is purely the presentation layer — every decision still comes from the
 * server-side agent (/api/agent/message) and the clinical triage service.
 */
import { el } from "../dom.js";
import type { AppState, ChatEntry } from "../store.js";
import type { FollowUpQuestion, SymptomAnswer } from "../../shared/types.js";
import { safetyNotice } from "./common.js";
import { levelOneResult, levelTwoResult, ScreenActions } from "./screens.js";
import { levelThreeResult } from "./level3.js";
import { providerContactResult } from "./consent.js";

export interface ChatActions extends ScreenActions {
  sendMessage: (text: string) => void;
}

function bubble(entry: ChatEntry): HTMLElement {
  const who = entry.role === "user" ? "user" : "agent";
  return el(
    "div",
    { class: `bubble-row ${who}` },
    el(
      "div",
      { class: `bubble ${who}${entry.kind === "typing" ? " typing" : ""}` },
      entry.kind === "typing"
        ? el(
            "span",
            { class: "typing-dots" },
            el("span", {}),
            el("span", {}),
            el("span", {}),
          )
        : entry.content,
    ),
  );
}

/** Quick-reply buttons for the current follow-up question. */
function quickReplies(
  q: FollowUpQuestion,
  t: (k: string) => string,
  a: ChatActions,
): HTMLElement | false {
  const mk = (answer: SymptomAnswer["answer"]): SymptomAnswer => ({
    questionId: q.questionId,
    question: q.question,
    answer,
    answeredAt: new Date().toISOString(),
    source: "user",
  });

  const btns: HTMLElement[] = [];
  if (q.answerType === "boolean") {
    btns.push(
      el("button", { class: "chip", onclick: () => a.answerQuestion(mk(true)) }, t("yes")),
      el("button", { class: "chip", onclick: () => a.answerQuestion(mk(false)) }, t("no")),
    );
  } else if (q.answerType === "single_select" && q.answerOptions) {
    for (const opt of q.answerOptions) {
      btns.push(
        el("button", { class: "chip", onclick: () => a.answerQuestion(mk(opt)) }, opt),
      );
    }
  }
  // For text/number questions the user just types in the composer below.
  btns.push(
    el("button", { class: "chip ghost", onclick: () => a.answerQuestion(mk("I do not know")) }, t("i_dont_know")),
    el("button", { class: "chip ghost", onclick: () => a.answerQuestion(mk("Prefer not to answer")) }, t("prefer_not")),
  );
  if (q.canSkip)
    btns.push(
      el("button", { class: "chip ghost", onclick: () => a.answerQuestion(mk(null), true) }, t("skip")),
    );

  return el("div", { class: "quick-replies" }, ...btns);
}

/** The embedded triage result card (shown inside the chat when available). */
function resultCard(
  s: AppState,
  t: (k: string) => string,
  a: ChatActions,
): HTMLElement | false {
  if (!s.triage) return false;
  const level = s.triage.triageLevel;
  const card =
    level === 3
      ? levelThreeResult(s, t, a)
      : level === 2
        ? levelTwoResult(s, t, a)
        : levelOneResult(s, t, a);
  const extras: HTMLElement[] = [];
  if (s.providerContact) extras.push(providerContactResult(t, s.providerContact));
  return el("div", { class: "chat-result" }, card, ...extras);
}

export function chatScreen(
  s: AppState,
  t: (k: string) => string,
  a: ChatActions,
): HTMLElement {
  const log = el(
    "div",
    { class: "chat-log", id: "chat-log", ariaLive: "polite" },
    ...s.chatLog.map(bubble),
  );

  // If the last agent turn was a question, show quick replies under the log.
  const lastEntry = s.chatLog[s.chatLog.length - 1];
  const showQuick =
    !s.loading &&
    lastEntry &&
    lastEntry.role === "agent" &&
    lastEntry.kind === "question" &&
    s.currentQuestion;
  const quick = showQuick ? quickReplies(s.currentQuestion as FollowUpQuestion, t, a) : false;

  // If triage is complete, embed the result card at the end of the transcript.
  const showResult =
    !s.loading && s.screen === "chat" && s.triage && lastEntry && lastEntry.kind === "result";
  const result = showResult ? resultCard(s, t, a) : false;

  const input = el("input", {
    class: "chat-input",
    id: "chat-input",
    type: "text",
    placeholder: t("chat_placeholder"),
    ariaLabel: t("chat_placeholder"),
  }) as HTMLInputElement;

  const send = (): void => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    a.sendMessage(text);
  };
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      send();
    }
  });

  const composer = el(
    "div",
    { class: "chat-composer" },
    el(
      "button",
      {
        class: "chat-voice",
        ariaLabel: t("voice_input"),
        onclick: a.voiceInput,
      },
      "🎤",
    ),
    input,
    el("button", { class: "chat-send", ariaLabel: t("chat_send"), onclick: send }, "➤"),
  );

  return el(
    "div",
    { class: "chat-screen" },
    safetyNotice(t),
    log,
    quick || el("div", { class: "hidden" }),
    result || el("div", { class: "hidden" }),
    composer,
  );
}
