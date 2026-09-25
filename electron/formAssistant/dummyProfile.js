/**
 * The single source of test data for Auto Fill. Keys match the semantic vocabulary in
 * fieldMapper.js; `null` means "detected but never filled automatically" (e.g. file uploads).
 */
export const DUMMY_PROFILE = Object.freeze({
  firstName: "Nayem",
  lastName: "Islam",
  fullName: "Nayem Islam",
  email: "nayem@example.com",
  phone: "01700000000",
  dateOfBirth: "2000-01-01",
  gender: "Male",
  address: "Dhaka, Bangladesh",
  city: "Dhaka",
  state: "Dhaka",
  country: "Bangladesh",
  postalCode: "1200",
  nationality: "Bangladeshi",
  company: "Example Company",
  jobTitle: "Software Developer",
  website: "https://example.com",
  username: "nayem_example",
  password: "TestPassword123!",
  passportNumber: "TEST123456",
  nationalId: "TEST123456789",
  coverLetter: "This is a test application.",
  resume: null,
  profilePhoto: null,
});

/** Alternative spellings tried when matching a profile value against select/radio options. */
export const OPTION_ALIASES = Object.freeze({
  Bangladesh: ["BD", "BGD", "Bangladesh (+880)", "People's Republic of Bangladesh"],
  Bangladeshi: ["Bangladesh", "BD"],
  Male: ["M", "Man"],
  Dhaka: ["Dhaka Division", "DHK"],
});

/**
 * Predefined behaviour for checkboxes, matched against their label/name text in order. Anything
 * that matches no rule is left untouched — checkboxes are never checked blindly.
 */
export const CHECKBOX_RULES = Object.freeze([
  {
    id: "newsletter",
    label: "Newsletter / marketing",
    pattern: /\b(newsletter|subscribe|subscription|marketing|promotions?|promotional|offers?|mailing list|updates|sms|text messages|notifications?)\b/,
    checked: false,
  },
  {
    id: "terms",
    label: "Terms / agreement",
    pattern: /\b(terms|conditions|agree|agreement|accept|consent|privacy|policy|gdpr|certify|acknowledge|confirm that)\b/,
    checked: true,
  },
]);
