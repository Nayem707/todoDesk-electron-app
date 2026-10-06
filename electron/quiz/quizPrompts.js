const DIFFICULTY_GUIDE = {
  easy: "basic definitions and facts a beginner should know",
  medium: "applying concepts to common, practical situations",
  hard: "multi-step reasoning, edge cases and trade-offs",
  expert: "deep internals, subtle edge cases and expert-level trade-offs",
};

const TYPE_LABEL = {
  single_choice: "single-choice",
  multiple_choice: "multiple-answer",
  true_false: "true/false",
  coding: "code-reading",
};

const TYPE_RULES = {
  single_choice: [
    "Each question has exactly 4 options and exactly one correct option.",
    "Put the correct option's text in correctAnswer, copied exactly from options.",
  ],
  multiple_choice: [
    "Each question has exactly 5 options; 2 or 3 of them are correct.",
    "End the question with \"(Select all that apply.)\".",
    "Put every correct option's text in correctAnswers, copied exactly from options.",
  ],
  true_false: [
    "Each question is one clear factual statement that is either true or false.",
    'options must be exactly ["True", "False"]; correctAnswer must be "True" or "False".',
    "Mix true and false statements.",
  ],
  coding: [
    "Each question shows a short code snippet (at most 15 lines) in the code field, in the language most relevant to the topic.",
    "The question asks what the code outputs, returns, or what is wrong with it. Do not repeat the code in the question field.",
    "Each question has exactly 4 options and exactly one correct option, copied exactly into correctAnswer.",
  ],
};

export const QUESTION_SYSTEM_PROMPT = [
  "You are an expert exam author for a desktop learning app.",
  "You write accurate, unambiguous quiz questions and return them as strict JSON that matches the requested schema.",
  "Never write anything outside the JSON object.",
].join(" ");

const quote = (value) => `"${String(value).replace(/["\\]/g, "'")}"`;

/** Prompt for one batch of questions of a single type. */
export function buildQuestionPrompt({ topic, difficulty, focus, type, count, avoid = [], withTitle = false }) {
  const lines = [
    `Write ${count} ${difficulty} ${TYPE_LABEL[type]} quiz question${count === 1 ? "" : "s"} about ${quote(topic)}.`,
  ];
  if (focus) {
    lines.push(`Focus on: ${quote(focus)}.`);
  }
  lines.push(
    "",
    `Difficulty "${difficulty}": ${DIFFICULTY_GUIDE[difficulty]}.`,
    "",
    "Format:",
    ...TYPE_RULES[type].map((rule) => `- ${rule}`),
    "",
    "Quality rules:",
    `- Stay strictly within the topic ${quote(topic)}.`,
    "- Every question must be unambiguous and have one defensible answer key.",
    "- Never reveal or hint at the answer in the question text.",
    "- Distractors must be plausible, similar in length and style to the correct answer, and clearly wrong to an expert.",
    '- Do not use options such as "All of the above", "None of the above" or "Both A and B".',
    "- Do not prefix options with letters or numbers.",
    "- Do not repeat or rephrase any question, including the already-used ones listed below.",
    "- explanation: one or two sentences explaining why the answer is correct.",
    '- concept: the specific sub-concept being tested, 1 to 4 words (for example "Closures").',
    "- estimatedTime: realistic number of seconds a prepared learner needs (10 to 300)."
  );
  if (withTitle) {
    lines.push(`- title: a short, specific quiz title (at most 8 words) for a ${difficulty} quiz on ${quote(topic)}.`);
  }
  if (avoid.length > 0) {
    lines.push("", "Already-used questions (do not repeat):", ...avoid.map((text) => `- ${text.slice(0, 160)}`));
  }
  lines.push("", "Return only the JSON object.");
  return lines.join("\n");
}

export const ANALYSIS_SYSTEM_PROMPT = [
  "You are a supportive tutor reviewing a learner's quiz results.",
  "Base every statement only on the data provided; do not invent questions or scores.",
  "Return strict JSON that matches the requested schema and nothing else.",
].join(" ");

/** Prompt for the post-quiz analysis. `data` is a compact summary built by the service. */
export function buildAnalysisPrompt(data) {
  return [
    "Analyze this quiz attempt.",
    "",
    JSON.stringify(data),
    "",
    "Fields:",
    "- summary: two or three sentences on overall performance.",
    "- strengths: concepts the learner answered correctly and confidently (may be empty).",
    "- weaknesses: concepts that need improvement (may be empty).",
    "- missedConcepts: specific ideas behind the wrong or skipped answers.",
    "- difficultyInsight: how well the learner handled this difficulty level.",
    "- timeManagement: compare time spent with the estimated times; mention rushing or running slow.",
    "- recommendations: 2 to 4 concrete next steps.",
    "- suggestedTopics: 2 to 4 short topic names (2 to 5 words each) to practise next.",
    "",
    "Return only the JSON object.",
  ].join("\n");
}
