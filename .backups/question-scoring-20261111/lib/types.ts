export type Course = "BSc" | "ANM" | "GNM";
export type ExamCategory = "central" | "state";
export type TestCategory = "full_mock" | "subject_test" | "daily_quiz" | "pyq";
export type OptionKey = "a" | "b" | "c" | "d";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  course: Course;
  role: "user" | "admin";
  created_at: string;
}

export interface Exam {
  id: string;
  name: string;
  category: ExamCategory;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface Test {
  id: string;
  exam_id: string;
  category: TestCategory;
  name: string;
  subject: string | null;
  question_count: number;
  duration_minutes: number;
  subject_weights: Record<string, number> | null;
  is_active: boolean;
}

export interface Attempt {
  id: string;
  user_id: string;
  test_id: string;
  question_ids: string[];
  answers: Record<string, OptionKey>;
  status: "in_progress" | "submitted";
  score: number;
  total: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  started_at: string;
  submitted_at: string | null;
}

// Client-safe question — never contains correct_answer
export interface AttemptQuestion {
  id: string;
  subject: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface ReviewQuestion extends AttemptQuestion {
  correct_answer: OptionKey;
  explanation: string;
  user_answer: OptionKey | null;
}

// Admin-side full question row
export interface AdminQuestion {
  id: string;
  exam_id: string | null;
  subject: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: OptionKey;
  explanation: string;
  created_at: string;
}

export const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  full_mock: "Full Mock Test",
  subject_test: "Subject Test",
  daily_quiz: "Daily Quiz",
  pyq: "Previous Year Questions",
};

export const OPTION_LABELS: Record<OptionKey, string> = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
};

export function optionText(q: AttemptQuestion, key: OptionKey): string {
  return q[`option_${key}`];
}