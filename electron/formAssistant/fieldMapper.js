/**
 * Semantic field mapping.
 *
 * A mapper is `{ id, map(field, current) => MappingResult | null }`. `mapFields` runs mappers in
 * order and keeps the highest-confidence result, so an AI/LLM mapper can later be appended to
 * refine low-confidence rule results without changing detection or storage.
 *
 * @typedef {{ mappedField: string | null, confidence: number, source: string, reasons: string[] }} MappingResult
 */

export const FIELD_VOCABULARY = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "dateOfBirth",
  "gender",
  "address",
  "city",
  "state",
  "country",
  "postalCode",
  "nationality",
  "passportNumber",
  "nationalId",
  "username",
  "password",
  "company",
  "jobTitle",
  "website",
  "profilePhoto",
  "resume",
  "coverLetter",
];

const VOCABULARY_SET = new Set(FIELD_VOCABULARY);
export const MIN_MAPPING_CONFIDENCE = 0.45;

const STRONG = 1;
const WEAK = 0.6;

const FILE_ONLY = new Set(["profilePhoto", "resume"]);
const FILE_ALLOWED = new Set(["profilePhoto", "resume", "coverLetter"]);

/** @type {Record<string, { patterns: [RegExp, number][], exclude?: RegExp }>} */
const RULES = {
  firstName: {
    patterns: [
      [/\bfirst ?name\b/, STRONG],
      [/\bf ?name\b/, STRONG],
      [/\bgiven ?name\b/, STRONG],
      [/\bfore ?name\b/, STRONG],
      [/\bname first\b/, STRONG],
    ],
  },
  lastName: {
    patterns: [
      [/\blast ?name\b/, STRONG],
      [/\bl ?name\b/, STRONG],
      [/\bsur ?name\b/, STRONG],
      [/\bfamily ?name\b/, STRONG],
      [/\bname last\b/, STRONG],
    ],
  },
  fullName: {
    patterns: [
      [/\bfull ?name\b/, STRONG],
      [/\byour name\b/, STRONG],
      [/\b(applicant|contact|complete|legal|customer|candidate) name\b/, STRONG],
      [/\bname\b/, 0.8],
    ],
    exclude:
      /\b(first|last|sur|family|given|fore|middle|user|company|business|org|organi[sz]ation|file|display|nick|screen|account|domain|card|bank|father|mother|spouse|school|institution|product|project|event|team|field|job|f|l)\b|\b(fname|lname|username|surname)\b/,
  },
  email: {
    patterns: [
      [/\be ?mail\b/, STRONG],
      [/\bmail\b/, WEAK],
    ],
  },
  phone: {
    patterns: [
      [/\b(tele)?phone\b/, STRONG],
      [/\bmobile\b/, STRONG],
      [/\btel\b/, STRONG],
      [/\bcell\b/, STRONG],
      [/\bwhats ?app\b/, STRONG],
      [/\bmsisdn\b/, STRONG],
      [/\bcontact (no|number)\b/, STRONG],
      [/\bmob\b/, WEAK],
    ],
  },
  dateOfBirth: {
    patterns: [
      [/\bdob\b/, STRONG],
      [/\bdate of birth\b/, STRONG],
      [/\bbirth ?(date|day)\b/, STRONG],
      [/\bbday\b/, STRONG],
      [/\bbirth\b/, STRONG],
      [/\bborn\b/, WEAK],
    ],
    exclude: /\b(place|city|country) of birth\b|\bbirth ?(place|city|country)\b/,
  },
  gender: {
    patterns: [
      [/\bgender\b/, STRONG],
      [/\bsex\b/, STRONG],
    ],
  },
  address: {
    patterns: [
      [/\baddress\b/, STRONG],
      [/\bstreet\b/, STRONG],
      [/\baddr\b/, STRONG],
      [/\baddress ?line\b/, STRONG],
      [/\bline ?1\b/, WEAK],
    ],
    exclude: /\b(e ?mail|ip|web|mac|wallet|url|site)\b/,
  },
  city: {
    patterns: [
      [/\bcity\b/, STRONG],
      [/\btown\b/, STRONG],
      [/\blocality\b/, STRONG],
      [/\bsuburb\b/, STRONG],
      [/\bmunicipality\b/, STRONG],
    ],
    exclude: /\bbirth\b/,
  },
  state: {
    patterns: [
      [/\bstate\b/, STRONG],
      [/\bprovince\b/, STRONG],
      [/\bregion\b/, STRONG],
      [/\bcounty\b/, STRONG],
      [/\bprefecture\b/, STRONG],
      [/\b(division|district)\b/, WEAK],
    ],
  },
  country: {
    patterns: [
      [/\bcountry\b/, STRONG],
      [/\bnation\b/, WEAK],
    ],
    exclude: /\b(code|dial|birth|citizenship|issu(e|ed|ing))\b/,
  },
  postalCode: {
    patterns: [
      [/\bzip\b/, STRONG],
      [/\bzip ?code\b/, STRONG],
      [/\bpostal\b/, STRONG],
      [/\bpost ?code\b/, STRONG],
      [/\bpin ?code\b/, STRONG],
      [/\bplz\b/, WEAK],
    ],
  },
  nationality: {
    patterns: [
      [/\bnationality\b/, STRONG],
      [/\bcitizenship\b/, STRONG],
      [/\bcitizen\b/, WEAK],
    ],
  },
  passportNumber: {
    patterns: [
      [/\bpassport\b/, STRONG],
    ],
    exclude: /\b(expiry|expiration|expires|issue|issued|issuing|country|photo|scan|copy|date|valid)\b/,
  },
  nationalId: {
    patterns: [
      [/\bnational ?id\b/, STRONG],
      [/\bnid\b/, STRONG],
      [/\bssn\b/, STRONG],
      [/\bsocial security\b/, STRONG],
      [/\bid ?(number|no)\b/, STRONG],
      [/\bidentity ?(card|number|no)\b/, STRONG],
      [/\baadhaa?r\b/, STRONG],
      [/\bc?nic\b/, STRONG],
      [/\btax ?id\b/, WEAK],
    ],
    exclude: /\b(user|login|account|e ?mail|transaction|order)\b/,
  },
  username: {
    patterns: [
      [/\buser ?name\b/, STRONG],
      [/\buser ?id\b/, STRONG],
      [/\blogin\b/, STRONG],
      [/\bscreen name\b/, STRONG],
      [/\baccount ?name\b/, STRONG],
      [/\bhandle\b/, WEAK],
    ],
  },
  password: {
    patterns: [
      [/\bpass ?word\b/, STRONG],
      [/\bpwd\b/, STRONG],
      [/\bpass ?code\b/, STRONG],
      [/\bpass\b/, WEAK],
    ],
  },
  company: {
    patterns: [
      [/\bcompany\b/, STRONG],
      [/\borgani[sz]ation\b/, STRONG],
      [/\bemployer\b/, STRONG],
      [/\bbusiness ?name\b/, STRONG],
      [/\b(firm|org)\b/, WEAK],
    ],
  },
  jobTitle: {
    patterns: [
      [/\bjob ?title\b/, STRONG],
      [/\bposition\b/, STRONG],
      [/\bdesignation\b/, STRONG],
      [/\boccupation\b/, STRONG],
      [/\brole\b/, WEAK],
      [/\btitle\b/, WEAK],
    ],
    exclude: /\b(salutation|honorific|prefix)\b/,
  },
  website: {
    patterns: [
      [/\bweb ?site\b/, STRONG],
      [/\burl\b/, STRONG],
      [/\bhome ?page\b/, STRONG],
      [/\bportfolio\b/, STRONG],
      [/\b(linked ?in|github|web)\b/, WEAK],
    ],
  },
  profilePhoto: {
    patterns: [
      [/\bphoto(graph)?\b/, STRONG],
      [/\bavatar\b/, STRONG],
      [/\bpicture\b/, STRONG],
      [/\bprofile ?(image|pic|photo)\b/, STRONG],
      [/\bheadshot\b/, STRONG],
      [/\bimage\b/, WEAK],
    ],
    exclude: /\bpassport (scan|copy)\b/,
  },
  resume: {
    patterns: [
      [/\bresume\b/, STRONG],
      [/\bcv\b/, STRONG],
      [/\bcurriculum vitae\b/, STRONG],
    ],
  },
  coverLetter: {
    patterns: [
      [/\bcover ?letter\b/, STRONG],
      [/\bmotivation(al)? ?letter\b/, STRONG],
      [/\bletter of motivation\b/, STRONG],
      [/\bcover\b/, WEAK],
    ],
  },
};

/** Weight for each signal source; label-like signals written for humans are most reliable. */
const SIGNAL_WEIGHTS = {
  label: 0.95,
  name: 0.92,
  ariaLabel: 0.92,
  id: 0.9,
  placeholder: 0.85,
  legend: 0.7,
  nearbyText: 0.6,
};

const AUTOCOMPLETE_MAP = {
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-local": "phone",
  bday: "dateOfBirth",
  "bday-day": "dateOfBirth",
  "bday-month": "dateOfBirth",
  "bday-year": "dateOfBirth",
  sex: "gender",
  "street-address": "address",
  "address-line1": "address",
  "address-line2": "address",
  "address-line3": "address",
  "address-level2": "city",
  "address-level1": "state",
  country: "country",
  "country-name": "country",
  "postal-code": "postalCode",
  username: "username",
  "current-password": "password",
  "new-password": "password",
  organization: "company",
  "organization-title": "jobTitle",
  url: "website",
  photo: "profilePhoto",
};

const COUNTRY_HINTS = [
  "united states",
  "united kingdom",
  "canada",
  "india",
  "bangladesh",
  "germany",
  "france",
  "australia",
  "japan",
  "brazil",
  "pakistan",
  "china",
];

/** Splits camelCase / snake_case / kebab-case / brackets into lowercase space-separated words. */
export function normalizeText(value) {
  if (!value) {
    return "";
  }
  const words = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return words ? ` ${words} ` : "";
}

function isAllowedForType(target, field) {
  const type = field.type;
  if (type === "file") {
    return FILE_ALLOWED.has(target);
  }
  if (FILE_ONLY.has(target)) {
    return false;
  }
  if (target === "coverLetter") {
    return field.tag === "textarea";
  }
  if (type === "checkbox") {
    return false;
  }
  return true;
}

function matchRule(target, text) {
  const rule = RULES[target];
  if (!rule || !text || (rule.exclude && rule.exclude.test(text))) {
    return 0;
  }
  let best = 0;
  for (const [pattern, weight] of rule.patterns) {
    if (pattern.test(text)) {
      best = Math.max(best, weight);
    }
  }
  return best;
}

function parseAutocomplete(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const target = AUTOCOMPLETE_MAP[tokens[index]];
    if (target) {
      return { token: tokens[index], target };
    }
  }
  return null;
}

function optionLabels(field) {
  return (field.options || []).map((option) => normalizeText(option.label || option.value));
}

function short(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** Collects `{ target, score, reason }` evidence from every available signal. */
function collectEvidence(field) {
  const evidence = [];
  const add = (target, score, reason) => {
    if (score > 0 && isAllowedForType(target, field)) {
      evidence.push({ target, score, reason });
    }
  };

  const autocomplete = parseAutocomplete(field.autocomplete);
  if (autocomplete) {
    add(autocomplete.target, 0.97, `autocomplete "${autocomplete.token}"`);
  }

  for (const [signal, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const raw = field[signal];
    const text = normalizeText(raw);
    if (!text) {
      continue;
    }
    for (const target of FIELD_VOCABULARY) {
      const match = matchRule(target, text);
      if (match) {
        add(target, weight * match, `${signal} "${short(raw)}"`);
      }
    }
  }

  switch (field.type) {
    case "email":
      add("email", 0.9, "input type email");
      break;
    case "tel":
      add("phone", 0.85, "input type tel");
      break;
    case "password":
      add("password", 0.95, "input type password");
      break;
    case "url":
      add("website", 0.8, "input type url");
      break;
    case "date":
      if (evidence.some((item) => item.target === "dateOfBirth")) {
        add("dateOfBirth", 0.6, "input type date");
      }
      break;
    case "file": {
      const accept = String(field.accept || "").toLowerCase();
      if (/image/.test(accept)) {
        add("profilePhoto", 0.6, `accepts ${short(accept)}`);
      } else if (/pdf|doc|msword|officedocument/.test(accept)) {
        add("resume", 0.5, `accepts ${short(accept)}`);
      }
      break;
    }
    default:
      break;
  }

  const labels = optionLabels(field);
  if (labels.length) {
    const joined = labels.join(" ");
    if (/\bmale\b/.test(joined) && /\bfemale\b/.test(joined)) {
      add("gender", 0.9, "options include male/female");
    }
    const countryHits = COUNTRY_HINTS.filter((name) => joined.includes(` ${name} `)).length;
    if (labels.length >= 30 && countryHits >= 3) {
      add("country", 0.85, "options list countries");
    }
  }

  return evidence;
}

/** Noisy-OR: independent agreeing signals raise confidence without exceeding 1. */
function combine(scores) {
  return 1 - scores.reduce((acc, score) => acc * (1 - Math.min(score, 0.999)), 1);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export const ruleBasedMapper = {
  id: "rules",
  /** @returns {MappingResult} */
  map(field) {
    const evidence = collectEvidence(field);
    const byTarget = new Map();
    for (const item of evidence) {
      const entry = byTarget.get(item.target) ?? { scores: [], reasons: [] };
      entry.scores.push(item.score);
      if (!entry.reasons.includes(item.reason)) {
        entry.reasons.push(item.reason);
      }
      byTarget.set(item.target, entry);
    }

    const ranked = [...byTarget.entries()]
      .map(([target, entry]) => ({ target, confidence: combine(entry.scores), reasons: entry.reasons }))
      .sort((a, b) => b.confidence - a.confidence);

    const [best, second] = ranked;
    if (!best || best.confidence < MIN_MAPPING_CONFIDENCE) {
      return { mappedField: null, confidence: round(best?.confidence ?? 0), source: "rules", reasons: [] };
    }

    let confidence = best.confidence;
    const reasons = best.reasons.slice(0, 4);
    if (second && best.confidence - second.confidence < 0.1) {
      confidence *= 0.8;
      reasons.push(`also resembles ${second.target}`);
    }

    return { mappedField: best.target, confidence: round(confidence), source: "rules", reasons };
  },
};

/**
 * @param {object[]} fields Extracted fields.
 * @param {{ id: string, map: (field: object, current: MappingResult | null) => MappingResult | null }[]} [mappers]
 */
export function mapFields(fields, mappers = [ruleBasedMapper]) {
  return fields.map((field) => {
    let current = null;
    for (const mapper of mappers) {
      const next = mapper.map(field, current);
      if (next && (!current || next.confidence > current.confidence)) {
        current = next;
      }
    }
    const mapping = current ?? { mappedField: null, confidence: 0, source: "rules", reasons: [] };
    return {
      ...field,
      mappedField: mapping.mappedField,
      confidence: mapping.confidence,
      mappingSource: mapping.source,
      mappingReasons: mapping.reasons,
    };
  });
}

export function isKnownField(value) {
  return value === null || VOCABULARY_SET.has(value);
}
