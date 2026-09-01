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
  // Quick replies for a pending follow-up question (none once triage is done).
  const lastEntry = s.chatLog[s.chatLog.length - 1];
  const showQuick =
    !s.loading &&
    !s.triage &&
    lastEntry &&
    lastEntry.role === "agent" &&
    lastEntry.kind === "question" &&
    s.currentQuestion;
  const quick = showQuick ? quickReplies(s.currentQuestion as FollowUpQuestion, t, a) : false;

  // If triage is complete, always embed the result card (guidance, warning
  // signs, emergency number / escalation). This is safety-critical for Level 3,
  // so it must not depend on which bubble happens to be last in the transcript.
  const showResult = !s.loading && s.triage !== null;
  const result = showResult ? resultCard(s, t, a) : false;

  // The transcript scrolls. The result card lives INSIDE it (it is part of the
  // conversation and must stay visible for Level 3). Quick-reply chips are a
  // separate action bar below the log so they don't scroll away or leak into
  // the transcript text.
  const log = el(
    "div",
    { class: "chat-log", id: "chat-log", ariaLive: "polite" },
    ...s.chatLog.map(bubble),
    result || el("div", { class: "hidden" }),
  );

  const input = el("input", {
    class: "chat-input",
    id: "chat-input",
    type: "text",
    placeholder: t("chat_placeholder"),
    ariaLabel: t("chat_placeholder"),
  }) as HTMLInputElement;

  if (s.loading) input.disabled = true;

  const send = (): void => {
    if (s.loading) return;
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
        disabled: s.loading,
        onclick: () => {
          if (!s.loading) a.voiceInput();
        },
      },
      "🎤",
    ),
    input,
    el(
      "button",
      { class: "chat-send", ariaLabel: t("chat_send"), disabled: s.loading, onclick: send },
      "➤",
    ),
  );

  // Auto-scroll after render. For an emergency (Level 3) result, scroll so the
  // TOP of the result card — where the "call now" number lives — is visible,
  // rather than the bottom of the transcript. For everything else, scroll to
  // the newest content as usual.
  window.setTimeout(() => {
    const l = document.getElementById("chat-log");
    if (!l) return;
    const emergency = s.triage?.triageLevel === 3;
    const card = l.querySelector(".chat-result") as HTMLElement | null;
    if (emergency && card) {
      l.scrollTop = Math.max(0, card.offsetTop - l.offsetTop - 8);
    } else {
      l.scrollTop = l.scrollHeight;
    }
  }, 30);

  return el(
    "div",
    { class: "chat-screen" },
    safetyNotice(t),
    log,
    quick ? el("div", { class: "quick-bar" }, quick) : el("div", { class: "hidden" }),
    composer,
  );
}
