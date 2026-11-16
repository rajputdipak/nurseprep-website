import Papa from "papaparse";

export interface QuestionImportRow {
  subject: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
}

const REQUIRED = ["subject", "question_text", "option_a", "option_b", "option_c", "option_d", "correct_answer"] as const;
export const IMPORT_BATCH_SIZE = 250;
export const MAX_IMPORT_ROWS = 10000;

export function parseQuestionCsv(text: string): { rows: QuestionImportRow[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => {
      const name = header.trim().toLowerCase();
      return name === "question" ? "question_text" : name;
    },
  });
  const errors = parsed.errors.map((error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`);
  const fields = parsed.meta.fields ?? [];
  if (!REQUIRED.every((field) => fields.includes(field))) {
    errors.push(`Required columns: ${REQUIRED.join(", ")} (question is also accepted for question_text)`);
    return { rows: [], errors };
  }
  const rows: QuestionImportRow[] = [];
  for (let index = 0; index < parsed.data.length; index++) {
    const row = parsed.data[index];
    const clean = Object.fromEntries(
      [...REQUIRED, "explanation"].map((field) => [field, typeof row[field] === "string" ? row[field].trim() : ""])
    ) as unknown as QuestionImportRow;
    const missing = REQUIRED.filter((field) => !clean[field]);
    if (missing.length) {
      errors.push(`Row ${index + 2}: missing ${missing.join(", ")}`);
      continue;
    }
    clean.correct_answer = clean.correct_answer.toLowerCase();
    if (!["a", "b", "c", "d"].includes(clean.correct_answer)) {
      errors.push(`Row ${index + 2}: correct_answer must be a/b/c/d`);
      continue;
    }
    rows.push(clean);
  }
  if (!parsed.data.length) errors.push("The CSV has no question rows");
  if (parsed.data.length > MAX_IMPORT_ROWS) errors.push(`Upload at most ${MAX_IMPORT_ROWS.toLocaleString()} rows per file`);
  return { rows, errors };
}
