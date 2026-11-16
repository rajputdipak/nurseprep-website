-- ============================================================
-- Seed data: exams, tests, plans, shared question bank
-- Run AFTER schema.sql. Safe to run once on a fresh project.
-- ============================================================

-- ---------- EXAMS ----------
insert into public.exams (name, category, description) values
  ('NORCET (AIIMS)', 'central', 'Nursing Officer Recruitment Common Eligibility Test for AIIMS and central institutes.'),
  ('ESIC Staff Nurse', 'central', 'Employees State Insurance Corporation nursing recruitment exam.'),
  ('RRB Staff Nurse', 'central', 'Railway Recruitment Board staff nurse and health worker exam.'),
  ('MNS (Military Nursing)', 'central', 'Military Nursing Service entrance exam for armed forces hospitals.'),
  ('UP PSC Staff Nurse', 'state', 'Uttar Pradesh Public Service Commission staff nurse recruitment.'),
  ('Maharashtra Staff Nurse', 'state', 'Maharashtra state government staff nurse recruitment exam.'),
  ('Bihar Staff Nurse', 'state', 'Bihar BTSC staff nurse recruitment exam.'),
  ('Rajasthan Staff Nurse', 'state', 'Rajasthan state nursing officer recruitment exam.');

-- ---------- TESTS (4 categories per exam) ----------
do $$
declare
  e record;
begin
  for e in select id, name from public.exams loop
    insert into public.tests (exam_id, category, name, question_count, duration_minutes, subject_weights)
    values (e.id, 'full_mock', e.name || ' — Full Mock Test', 50, 60,
      '{"Fundamentals of Nursing":1,"Medical-Surgical Nursing":1,"Pharmacology":1,"Obstetrics & Gynaecology":1,"Child Health Nursing":1,"Community Health Nursing":1,"Mental Health Nursing":1,"Anatomy & Physiology":1}');
    insert into public.tests (exam_id, category, name, subject, question_count, duration_minutes)
    values (e.id, 'subject_test', 'Medical-Surgical Nursing — Subject Test', 'Medical-Surgical Nursing', 8, 12);
    insert into public.tests (exam_id, category, name, question_count, duration_minutes)
    values (e.id, 'daily_quiz', 'Daily Quiz — 10 Questions', 10, 15);
    insert into public.tests (exam_id, category, name, question_count, duration_minutes)
    values (e.id, 'pyq', 'Previous Year Questions Practice', 25, 30);
  end loop;
end $$;

-- ---------- PLANS ----------
insert into public.plans (name, price, duration_days, features) values
  ('Free Trial', 0, 30, '["All exams", "All test categories", "Answer review with explanations"]'),
  ('Monthly', 299, 30, '["All exams", "Unlimited attempts", "Answer review with explanations"]'),
  ('Quarterly', 699, 90, '["All exams", "Unlimited attempts", "Answer review with explanations", "Best value"]');

-- ---------- SHARED QUESTION BANK (exam_id null = available to all exams) ----------

insert into public.questions (subject, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation) values
-- Fundamentals of Nursing
('Fundamentals of Nursing', 'What is the normal respiratory rate for a healthy adult?', '8–12 breaths/min', '12–20 breaths/min', '20–30 breaths/min', '30–40 breaths/min', 'b', 'A healthy adult at rest breathes 12–20 times per minute. Rates above 20 (tachypnea) or below 12 (bradypnea) need assessment.'),
('Fundamentals of Nursing', 'The single most effective method to prevent transmission of infection is:', 'Hand hygiene', 'Wearing gloves at all times', 'Using antibiotics prophylactically', 'Isolating every patient', 'a', 'Hand hygiene (soap and water or alcohol-based rub) breaks the chain of infection and is the cornerstone of infection control.'),
('Fundamentals of Nursing', 'Normal oral body temperature in an adult is approximately:', '35°C', '36°C', '37°C', '38°C', 'c', 'Average normal oral temperature is about 37°C (98.6°F); axillary is ~0.5°C lower and rectal ~0.5°C higher.'),
('Fundamentals of Nursing', 'The best position for an unconscious patient to prevent aspiration is:', 'Supine', 'Lateral (recovery) position', 'Trendelenburg', 'Lithotomy', 'b', 'The lateral recovery position allows secretions and vomitus to drain from the mouth, protecting the airway.'),
('Fundamentals of Nursing', 'A bed cradle is used mainly to:', 'Support the patient''s back', 'Keep the bed warm', 'Prevent pressure of bedclothes on the feet', 'Restrict patient movement', 'c', 'A bed cradle holds bedclothes off the feet/legs, preventing pressure injuries and foot drop in bedridden patients.'),
('Fundamentals of Nursing', 'Assessment in the nursing process should be done:', 'Only at admission', 'Only when the doctor orders', 'Only at discharge', 'Continuously throughout patient care', 'd', 'Assessment is ongoing and continuous — every interaction with the patient is an opportunity to collect data.'),
('Fundamentals of Nursing', 'Standard autoclave sterilization temperature and pressure is:', '100°C at 10 psi', '121°C at 15 psi', '150°C at 20 psi', '200°C at 25 psi', 'b', 'Steam under pressure at 121°C, 15 psi for 15–20 minutes destroys all microorganisms including spores.'),
('Fundamentals of Nursing', 'In nursing documentation, "not documented" means:', 'Not done', 'Done but forgotten', 'Done partially', 'Not important', 'a', 'Legal principle: care not recorded is considered care not given. Documentation is the legal record of nursing care.'),

-- Medical-Surgical Nursing
('Medical-Surgical Nursing', 'The classic triad of symptoms in diabetes mellitus is:', 'Polyuria, polydipsia, polyphagia', 'Fever, chills, sweats', 'Cough, cold, coryza', 'Pain, pallor, pulselessness', 'a', 'Hyperglycemia causes osmotic diuresis (polyuria), thirst (polydipsia) and hunger with weight loss (polyphagia).'),
('Medical-Surgical Nursing', 'The most common type of stroke is:', 'Hemorrhagic', 'Ischemic', 'Subarachnoid', 'Transient ischemic attack', 'b', 'About 85% of strokes are ischemic, caused by thrombotic or embolic occlusion of a cerebral artery.'),
('Medical-Surgical Nursing', 'COPD primarily includes:', 'Asthma and pneumonia', 'TB and bronchiectasis', 'Chronic bronchitis and emphysema', 'Lung cancer and fibrosis', 'c', 'Chronic obstructive pulmonary disease is characterized by chronic bronchitis (airway inflammation) and emphysema (alveolar destruction).'),
('Medical-Surgical Nursing', 'The most comfortable position for a patient with severe dyspnea is:', 'Fowler''s position', 'Supine', 'Prone', 'Trendelenburg', 'a', 'Sitting upright (Fowler''s 45–90°) allows maximum chest expansion and diaphragmatic descent, easing breathing.'),
('Medical-Surgical Nursing', 'The hallmark feature of nephrotic syndrome is:', 'Hematuria', 'Hypertension', 'Oliguria', 'Massive proteinuria (>3.5 g/day)', 'd', 'Nephrotic syndrome = massive proteinuria, hypoalbuminemia, edema and hyperlipidemia due to glomerular damage.'),
('Medical-Surgical Nursing', 'The most common cause of peptic ulcer disease is:', 'Stress', 'Helicobacter pylori infection', 'Spicy food', 'Excess exercise', 'b', 'H. pylori infection and NSAID use account for the vast majority of peptic ulcers.'),
('Medical-Surgical Nursing', 'The characteristic ECG change in hyperkalemia is:', 'ST depression', 'Prolonged QT', 'Tall, peaked T waves', 'U waves', 'c', 'Rising potassium shortens repolarization producing tall tented T waves; severe cases widen QRS and can cause cardiac arrest.'),
('Medical-Surgical Nursing', 'The priority intervention in hypovolemic shock is:', 'IV fluid resuscitation', 'Administering antibiotics', 'Giving oxygen only', 'Elevating the head', 'a', 'Restoring circulating volume with crystalloids (and blood when indicated) is the first priority to maintain tissue perfusion.'),

-- Pharmacology
('Pharmacology', 'The antidote for paracetamol (acetaminophen) overdose is:', 'Atropine', 'N-acetylcysteine', 'Naloxone', 'Flumazenil', 'b', 'N-acetylcysteine replenishes glutathione and prevents hepatotoxicity; most effective within 8 hours of ingestion.'),
('Pharmacology', 'The first-line drug for anaphylactic shock is:', 'Adrenaline (epinephrine)', 'Dexamethasone', 'Diphenhydramine', 'Salbutamol', 'a', 'IM adrenaline 0.5 mg (1:1000) is the immediate life-saving treatment — it reverses vasodilation and bronchospasm.'),
('Pharmacology', 'Warfarin therapy is monitored using:', 'aPTT', 'Bleeding time', 'PT/INR', 'Platelet count', 'c', 'Warfarin affects the extrinsic pathway; PT expressed as INR (target usually 2–3) guides dosing.'),
('Pharmacology', 'The antidote for heparin overdose is:', 'Vitamin K', 'Tranexamic acid', 'Fresh frozen plasma', 'Protamine sulfate', 'd', 'Protamine sulfate binds and neutralizes heparin; 1 mg protamine neutralizes ~100 units of heparin.'),
('Pharmacology', 'A common side effect of ACE inhibitors (e.g., enalapril) is:', 'Diarrhea', 'Dry persistent cough', 'Hair loss', 'Hypoglycemia', 'b', 'ACE inhibitors increase bradykinin in the lungs, causing a dry cough in up to 20% of patients.'),
('Pharmacology', 'Unopened insulin vials should be stored:', 'Refrigerated at 2–8°C', 'In direct sunlight', 'Frozen at −20°C', 'At room temperature for months', 'a', 'Insulin is a protein; unopened vials stay potent refrigerated (2–8°C). Never freeze insulin.'),
('Pharmacology', 'Which antibiotic is well known for ototoxicity and nephrotoxicity?', 'Penicillin', 'Amoxicillin', 'Gentamicin', 'Azithromycin', 'c', 'Aminoglycosides like gentamicin can damage the 8th cranial nerve and kidneys; monitor levels, renal function and hearing.'),
('Pharmacology', 'Before administering digoxin, the nurse must check:', 'Blood pressure', 'Apical pulse for one full minute', 'Respiratory rate', 'Temperature', 'b', 'Hold digoxin and inform the physician if apical pulse is below 60/min in adults — risk of bradycardia and toxicity.'),

-- Obstetrics & Gynaecology
('Obstetrics & Gynaecology', 'The normal fetal heart rate range is:', '60–100 bpm', '80–120 bpm', '110–160 bpm', '160–200 bpm', 'c', 'Normal baseline FHR is 110–160 bpm. Below 110 = bradycardia, above 160 = tachycardia; both need evaluation.'),
('Obstetrics & Gynaecology', 'Pregnancy tests detect which hormone?', 'hCG', 'Progesterone', 'Estrogen', 'FSH', 'a', 'Home pregnancy tests detect human chorionic gonadotropin produced by the placenta after implantation.'),
('Obstetrics & Gynaecology', 'The average duration of pregnancy from LMP is:', '240 days', '280 days', '320 days', '360 days', 'b', 'Naegele''s rule: 280 days (40 weeks) from the first day of the last menstrual period.'),
('Obstetrics & Gynaecology', 'The drug of choice for controlling eclamptic seizures is:', 'Diazepam', 'Phenytoin', 'Phenobarbitone', 'Magnesium sulfate', 'd', 'MgSO4 (Pritchard/Zuspan regimen) is superior to other anticonvulsants for preventing and controlling eclamptic fits.'),
('Obstetrics & Gynaecology', 'Normal implantation of the fertilized ovum occurs in the:', 'Endometrium of the uterus', 'Fallopian tube', 'Ovary', 'Cervix', 'a', 'Implantation normally occurs in the upper uterine endometrium (usually posterior fundal wall) 6–7 days after fertilization.'),
('Obstetrics & Gynaecology', 'The first perception of fetal movement by the mother is called:', 'Lightening', 'Quickening', 'Engagement', 'Braxton Hicks', 'b', 'Quickening is felt around 18–20 weeks in primigravida and 16–18 weeks in multigravida.'),
('Obstetrics & Gynaecology', 'Lochia rubra (red discharge) normally lasts for:', '24 hours', '1 week', '3–4 days', '2 weeks', 'c', 'Lochia rubra lasts 3–4 days, followed by lochia serosa (up to ~10 days) and lochia alba (up to 2–3 weeks).'),
('Obstetrics & Gynaecology', 'The antidote for magnesium sulfate toxicity is:', 'Calcium gluconate', 'Sodium bicarbonate', 'Potassium chloride', 'Atropine', 'a', '10 mL of 10% calcium gluconate IV antagonizes magnesium. Monitor reflexes, respiration (>16/min) and urine output during MgSO4 therapy.'),

-- Child Health Nursing
('Child Health Nursing', 'Vaccines given at birth under the Indian Universal Immunization Programme include:', 'BCG only', 'OPV only', 'Hepatitis B only', 'BCG, OPV-0 and Hepatitis B birth dose', 'd', 'At birth: BCG (TB), OPV zero dose (polio) and Hepatitis B birth dose are given.'),
('Child Health Nursing', 'Complementary feeding should be introduced at the age of:', '4 months', '6 months', '9 months', '12 months', 'b', 'WHO recommends exclusive breastfeeding for 6 months, then adequate complementary feeding with continued breastfeeding.'),
('Child Health Nursing', 'The anterior fontanelle normally closes by:', '2–3 months', '6–8 months', '12–18 months', '3 years', 'c', 'Anterior fontanelle closes at 12–18 months; posterior fontanelle closes by 2–3 months.'),
('Child Health Nursing', 'A sign of severe dehydration in an infant is:', 'Sunken anterior fontanelle', 'Bulging fontanelle', 'Excess tears', 'Weight gain', 'a', 'Sunken fontanelle, sunken eyes, poor skin turgor and lethargy indicate significant dehydration.'),
('Child Health Nursing', 'ORS (Oral Rehydration Solution) is mainly used to treat:', 'Fever', 'Dehydration due to diarrhea', 'Cough', 'Malnutrition only', 'b', 'Low-osmolarity ORS replaces water and electrolytes lost in diarrhea; it is the cornerstone of diarrheal management.'),
('Child Health Nursing', 'The average normal birth weight of a full-term newborn is:', '1.0–1.5 kg', '1.5–2.0 kg', '2.5–3.5 kg', '4.5–5.0 kg', 'c', 'Normal birth weight is 2.5–3.5 kg; below 2.5 kg is low birth weight.'),
('Child Health Nursing', 'Vitamin K is given to newborns to prevent:', 'Rickets', 'Scurvy', 'Night blindness', 'Hemorrhagic disease of the newborn', 'd', 'Newborns have sterile guts and low vitamin K stores; a single IM dose (1 mg) prevents vitamin K deficiency bleeding.'),
('Child Health Nursing', 'Koplik''s spots are a characteristic sign of:', 'Measles', 'Chickenpox', 'Mumps', 'Rubella', 'a', 'Koplik''s spots — small white spots on the buccal mucosa — appear 1–2 days before the measles rash.'),

-- Community Health Nursing
('Community Health Nursing', 'Health promotion and specific protection belong to which level of prevention?', 'Primary prevention', 'Secondary prevention', 'Tertiary prevention', 'Primordial prevention', 'a', 'Primary prevention acts before disease occurs: health promotion (nutrition, sanitation) and specific protection (immunization).'),
('Community Health Nursing', 'Malaria is transmitted by:', 'Male Anopheles mosquito', 'Female Anopheles mosquito', 'Aedes mosquito', 'Culex mosquito', 'b', 'Only the female Anopheles mosquito transmits Plasmodium; Aedes spreads dengue/chikungunya, Culex spreads filariasis.'),
('Community Health Nursing', 'ASHA stands for:', 'Allied Social Health Assistant', 'Accredited Society for Health Aid', 'Accredited Social Health Activist', 'Association of State Health Agencies', 'c', 'ASHA is a community health worker under NHM, one per ~1000 population, linking the community with the health system.'),
('Community Health Nursing', 'Incidence refers to:', 'Total existing cases at a point in time', 'Total deaths in a population', 'Existing cases over a year', 'Number of NEW cases in a defined period', 'd', 'Incidence counts new cases in a population over a time period; prevalence counts all existing cases.'),
('Community Health Nursing', 'Vaccines in the cold chain at the health facility are stored at:', '+2°C to +8°C', '−20°C', '0°C exactly', 'Room temperature', 'a', 'Most vaccines (OPV, DPT, HepB, measles after reconstitution) are kept at +2 to +8°C; OPV long-term storage is at −20°C.'),
('Community Health Nursing', 'India''s national programme for tuberculosis control is now called:', 'NVBDCP', 'NTEP', 'NACP', 'RMNCH+A', 'b', 'The National TB Elimination Programme (NTEP), formerly RNTCP, targets TB elimination with free diagnosis and DOTS treatment.'),
('Community Health Nursing', 'Herd immunity is achieved mainly through:', 'Isolation of cases', 'Vector control', 'High vaccination coverage', 'Antibiotic prophylaxis', 'c', 'When a large proportion of the population is immune (usually via vaccination), disease spread is interrupted, protecting the vulnerable.'),
('Community Health Nursing', 'Human anatomical biomedical waste is discarded in which color bag?', 'Red', 'Blue', 'Black', 'Yellow', 'd', 'Yellow bag: anatomical waste, soiled waste, expired medicines — sent for incineration/deep burial. Red: recyclable plastics; Blue: glass/metallic implants.'),

-- Mental Health Nursing
('Mental Health Nursing', 'Perception without any external stimulus is called:', 'Hallucination', 'Illusion', 'Delusion', 'Obsession', 'a', 'Hallucination is a false perception (e.g., hearing voices) without an external stimulus; illusion is misinterpretation of a real stimulus.'),
('Mental Health Nursing', 'The main class of drugs used to treat schizophrenia is:', 'Antidepressants', 'Antipsychotics', 'Anxiolytics', 'Mood stabilizers', 'b', 'Antipsychotics (e.g., haloperidol, risperidone, olanzapine) reduce positive symptoms like delusions and hallucinations.'),
('Mental Health Nursing', 'Attributing one''s own unacceptable feelings to another person is the defense mechanism called:', 'Denial', 'Regression', 'Projection', 'Sublimation', 'c', 'Projection: "I''m not angry, YOU are angry" — the person attributes their own impulses to someone else.'),
('Mental Health Nursing', 'Lithium carbonate is the classic mood stabilizer used for:', 'Schizophrenia', 'Anxiety disorder', 'Depression only', 'Bipolar disorder (mania)', 'd', 'Lithium controls manic episodes and prevents relapse in bipolar disorder; monitor serum levels (0.6–1.2 mEq/L).'),
('Mental Health Nursing', 'The most important nursing intervention for a suicidal patient is:', 'Constant observation and a safe environment', 'Giving sedatives', 'Encouraging solitude', 'Ignoring the statements', 'a', 'Safety first: one-to-one observation, removal of harmful objects and a therapeutic relationship reduce suicide risk.'),
('Mental Health Nursing', 'A fixed false belief not amenable to reasoning is called:', 'Hallucination', 'Delusion', 'Phobia', 'Compulsion', 'b', 'Delusions are fixed false beliefs held despite evidence — e.g., delusion of persecution or grandeur.'),
('Mental Health Nursing', 'ECT (electroconvulsive therapy) is most commonly indicated in:', 'Mild anxiety', 'Personality disorder', 'Severe depression with suicide risk', 'Common cold', 'c', 'ECT gives rapid response in severe depression, catatonia and high suicide risk when drugs are too slow or ineffective.'),
('Mental Health Nursing', 'Repeating the patient''s main idea in the nurse''s own words is the therapeutic technique of:', 'Giving advice', 'Challenging', 'Agreeing', 'Restating/reflecting', 'd', 'Restating and reflecting encourage the patient to continue and show the nurse is listening; advice-giving and challenging are non-therapeutic.'),

-- Anatomy & Physiology
('Anatomy & Physiology', 'The "powerhouse of the cell" is:', 'Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body', 'a', 'Mitochondria produce ATP through oxidative phosphorylation — the cell''s main energy currency.'),
('Anatomy & Physiology', 'Normal hemoglobin in an adult male is approximately:', '8–10 g/dL', '13–17 g/dL', '18–22 g/dL', '5–7 g/dL', 'b', 'Adult males: 13–17 g/dL; adult females: 12–15 g/dL. Lower values indicate anemia.'),
('Anatomy & Physiology', 'The largest organ of the human body is:', 'Liver', 'Brain', 'Skin', 'Lungs', 'c', 'Skin is the largest organ (~16% of body weight); liver is the largest internal organ.'),
('Anatomy & Physiology', 'The human heart has how many chambers?', '2', '3', '5', '4', 'd', 'Two atria receive blood; two ventricles pump it out — right side to lungs, left side to the body.'),
('Anatomy & Physiology', 'The structural and functional unit of the kidney is:', 'Nephron', 'Neuron', 'Alveolus', 'Hepatocyte', 'a', 'Each kidney has ~1 million nephrons that filter blood and form urine.'),
('Anatomy & Physiology', 'The universal donor blood group is:', 'AB positive', 'O negative', 'A positive', 'B negative', 'b', 'O negative red cells have no A, B or Rh antigens, so they can be given to any recipient in emergencies.'),
('Anatomy & Physiology', 'The longest bone in the human body is:', 'Humerus', 'Tibia', 'Femur', 'Fibula', 'c', 'The femur (thigh bone) is the longest and strongest bone, about 26% of body height.'),
('Anatomy & Physiology', 'The "master gland" of the endocrine system is:', 'Thyroid', 'Adrenal', 'Pancreas', 'Pituitary', 'd', 'The pituitary secretes hormones (TSH, ACTH, GH, FSH/LH) that control most other endocrine glands.');

-- ---------- MAKE YOURSELF ADMIN ----------
-- Replace with the email you registered with, then run this line:
-- update public.profiles set role = 'admin' where email = 'your-email@gmail.com';