# 15 Drug Examples - Prior Authorization Question Flows

This document provides comprehensive examples of 15 different medications with their complete prior authorization question flows, decision paths, and clinical criteria.

## Overview

Each drug has a specific question set that leads to **approval**, **denial**, or **documentation required** based on clinical criteria. The questions follow a logical flow that mimics real-world prior authorization processes.

---

## 1. Ozempic (semaglutide) - GLP-1 Receptor Agonist

**Indication:** Type 2 Diabetes  
**Category:** GLP-1 Receptor Agonist  
**Question Set:** `diabetes_glp1`

### Question Flow:
1. **Primary Diagnosis**
   - Options: Type 2 Diabetes, Type 1 Diabetes, Obesity, Other
   - **Path:** Type 2 Diabetes → A1C Level
   - **Path:** Type 1 Diabetes → **DENY** (not indicated)
   - **Path:** Obesity → BMI Level
   - **Path:** Other → **DENY**

2. **A1C Level** (if Type 2 Diabetes)
   - Type: Numeric (6.5-15.0%)
   - **Path:** 6.5-15.0% → Current Medications
   - **Path:** Outside range → **DENY**

3. **BMI Level** (if Obesity)
   - Type: Numeric (30-100 kg/m²)
   - **Path:** 30-100 kg/m² → Current Medications
   - **Path:** Outside range → **DENY**

4. **Current Diabetes Medications**
   - Type: Yes/No
   - **Path:** Yes → List Medications
   - **Path:** No → Step 1 Required

5. **List Medications** (if Yes)
   - Type: Text
   - **Path:** → Step 1 Required

6. **Step 1 Medication Trial**
   - Type: Yes/No
   - **Path:** Yes → Step 1 Failure Details
   - **Path:** No → **DENY** (must try step 1 first)

7. **Step 1 Failure Details**
   - Type: Text
   - **Path:** → Contraindications

8. **Contraindications**
   - Type: Yes/No
   - **Path:** Yes → **DENY** (medullary thyroid carcinoma, MEN2)
   - **Path:** No → **APPROVE**

### Approval Criteria:
- Type 2 Diabetes with A1C ≥6.5% OR Obesity with BMI ≥30
- Failed at least one step 1 medication (metformin, sulfonylurea, DPP-4 inhibitor)
- No contraindications

---

## 2. Mounjaro (tirzepatide) - GLP-1/GIP Receptor Agonist

**Indication:** Type 2 Diabetes  
**Category:** GLP-1/GIP Receptor Agonist  
**Question Set:** `diabetes_glp1` (same as Ozempic)

### Approval Criteria:
- Same as Ozempic
- Type 2 Diabetes with A1C ≥6.5% OR Obesity with BMI ≥30
- Failed at least one step 1 medication
- No contraindications

---

## 3. Humira (adalimumab) - TNF Inhibitor

**Indication:** Rheumatoid Arthritis, Crohn's Disease, Psoriasis  
**Category:** TNF Inhibitor  
**Question Set:** `biologic_anti_tnf`

### Question Flow:
1. **Primary Diagnosis**
   - Options: RA, PsA, AS, Crohn's, UC, Psoriasis, Other
   - **Path:** RA/PsA/AS/Crohn's/UC → Disease Duration
   - **Path:** Psoriasis → Psoriasis Severity
   - **Path:** Other → **DENY**

2. **Disease Duration**
   - Options: <6 months, 6-12 months, 1-2 years, >2 years
   - **Path:** <6 months → **DENY** (insufficient duration)
   - **Path:** 6+ months → Conventional Therapy

3. **Psoriasis Severity** (if Psoriasis)
   - Options: Mild (<3% BSA), Moderate (3-10% BSA), Severe (>10% BSA)
   - **Path:** Mild → **DENY** (insufficient severity)
   - **Path:** Moderate/Severe → Conventional Therapy

4. **Conventional Therapy Trial**
   - Type: Yes/No
   - **Path:** Yes → List Therapies
   - **Path:** No → **DENY**

5. **List Conventional Therapies**
   - Type: Text
   - **Path:** → Infection Screening

6. **Infection Screening**
   - Type: Yes/No
   - **Path:** Yes → Infection Results
   - **Path:** No → **DOCUMENTATION REQUIRED**

7. **Infection Results**
   - Options: Negative, Positive TB, Positive other, Pending
   - **Path:** Negative → **APPROVE**
   - **Path:** Positive TB/other → **DENY**
   - **Path:** Pending → **DOCUMENTATION REQUIRED**

### Approval Criteria:
- Diagnosis: RA, PsA, AS, Crohn's, UC, or moderate/severe psoriasis
- Disease duration ≥6 months
- Failed conventional therapy
- Negative TB and infection screening

---

## 4. Stelara (ustekinumab) - IL-12/23 Inhibitor

**Indication:** Psoriasis, Crohn's Disease, Ulcerative Colitis  
**Category:** IL-12/23 Inhibitor  
**Question Set:** `biologic_il_inhibitor`

### Question Flow:
1. **Primary Diagnosis**
   - Options: Psoriasis, PsA, AS, Crohn's, UC, Atopic Dermatitis, Asthma, Other
   - **Path:** Psoriasis → Psoriasis Severity
   - **Path:** PsA/AS/Crohn's/UC → Disease Duration
   - **Path:** Atopic Dermatitis → Atopic Severity
   - **Path:** Asthma → Asthma Severity
   - **Path:** Other → **DENY**

2. **Psoriasis Severity** (if Psoriasis)
   - Options: Mild, Moderate, Severe
   - **Path:** Mild → **DENY**
   - **Path:** Moderate/Severe → Conventional Therapy

3. **Disease Duration** (if PsA/AS/Crohn's/UC)
   - Options: <6 months, 6-12 months, 1-2 years, >2 years
   - **Path:** <6 months → **DENY**
   - **Path:** 6+ months → Conventional Therapy

4. **Atopic Severity** (if Atopic Dermatitis)
   - Options: Mild, Moderate, Severe
   - **Path:** Mild → **DENY**
   - **Path:** Moderate/Severe → Conventional Therapy

5. **Asthma Severity** (if Asthma)
   - Options: Mild, Moderate, Severe
   - **Path:** Mild → **DENY**
   - **Path:** Moderate/Severe → Conventional Therapy

6. **Conventional Therapy Trial**
   - Type: Yes/No
   - **Path:** Yes → List Therapies
   - **Path:** No → **DENY**

7. **List Conventional Therapies**
   - Type: Text
   - **Path:** → Infection Screening

8. **Infection Screening**
   - Type: Yes/No
   - **Path:** Yes → Infection Results
   - **Path:** No → **DOCUMENTATION REQUIRED**

9. **Infection Results**
   - Options: Negative, Positive TB, Positive other, Pending
   - **Path:** Negative → **APPROVE**
   - **Path:** Positive TB/other → **DENY**
   - **Path:** Pending → **DOCUMENTATION REQUIRED**

### Approval Criteria:
- Appropriate diagnosis with sufficient severity/duration
- Failed conventional therapy
- Negative TB and infection screening

---

## 5. Skyrizi (risankizumab) - IL-23 Inhibitor

**Indication:** Psoriasis, Crohn's Disease  
**Category:** IL-23 Inhibitor  
**Question Set:** `biologic_il_inhibitor` (same as Stelara)

### Approval Criteria:
- Same as Stelara
- Appropriate diagnosis with sufficient severity/duration
- Failed conventional therapy
- Negative TB and infection screening

---

## 6. Dupixent (dupilumab) - IL-4/13 Inhibitor

**Indication:** Atopic Dermatitis, Asthma, Chronic Rhinosinusitis  
**Category:** IL-4/13 Inhibitor  
**Question Set:** `biologic_il_inhibitor` (same as Stelara)

### Approval Criteria:
- Atopic Dermatitis (moderate/severe), Asthma (moderate/severe), or CRS
- Failed conventional therapy
- Negative TB and infection screening

---

## 7. Rinvoq (upadacitinib) - JAK Inhibitor

**Indication:** Rheumatoid Arthritis, Psoriatic Arthritis, Atopic Dermatitis  
**Category:** JAK Inhibitor  
**Question Set:** `jak_inhibitor`

### Question Flow:
1. **Primary Diagnosis**
   - Options: RA, PsA, UC, Atopic Dermatitis, Other
   - **Path:** RA/PsA/UC → Disease Duration
   - **Path:** Atopic Dermatitis → Atopic Severity
   - **Path:** Other → **DENY**

2. **Disease Duration**
   - Options: <6 months, 6-12 months, 1-2 years, >2 years
   - **Path:** <6 months → **DENY**
   - **Path:** 6+ months → Conventional Therapy

3. **Atopic Severity** (if Atopic Dermatitis)
   - Options: Mild, Moderate, Severe
   - **Path:** Mild → **DENY**
   - **Path:** Moderate/Severe → Conventional Therapy

4. **Conventional Therapy Trial**
   - Type: Yes/No
   - **Path:** Yes → List Therapies
   - **Path:** No → **DENY**

5. **List Conventional Therapies**
   - Type: Text
   - **Path:** → Age Check

6. **Age Check**
   - Type: Numeric (18-65 years)
   - **Path:** 18-65 years → Infection Screening
   - **Path:** Outside range → **DENY**

7. **Infection Screening**
   - Type: Yes/No
   - **Path:** Yes → Infection Results
   - **Path:** No → **DOCUMENTATION REQUIRED**

8. **Infection Results**
   - Options: Negative, Positive TB, Positive other, Pending
   - **Path:** Negative → **APPROVE**
   - **Path:** Positive TB/other → **DENY**
   - **Path:** Pending → **DOCUMENTATION REQUIRED**

### Approval Criteria:
- Appropriate diagnosis with sufficient duration
- Failed conventional therapy
- Age 18-65 years
- Negative TB and infection screening

---

## 8. Xeljanz (tofacitinib) - JAK Inhibitor

**Indication:** Rheumatoid Arthritis, Psoriatic Arthritis, Ulcerative Colitis  
**Category:** JAK Inhibitor  
**Question Set:** `jak_inhibitor` (same as Rinvoq)

### Approval Criteria:
- Same as Rinvoq
- Appropriate diagnosis with sufficient duration
- Failed conventional therapy
- Age 18-65 years
- Negative TB and infection screening

---

## 9. Cosentyx (secukinumab) - IL-17 Inhibitor

**Indication:** Psoriasis, Psoriatic Arthritis, Ankylosing Spondylitis  
**Category:** IL-17 Inhibitor  
**Question Set:** `biologic_il_inhibitor` (same as Stelara)

### Approval Criteria:
- Same as Stelara
- Appropriate diagnosis with sufficient severity/duration
- Failed conventional therapy
- Negative TB and infection screening

---

## 10. Taltz (ixekizumab) - IL-17 Inhibitor

**Indication:** Psoriasis, Psoriatic Arthritis, Ankylosing Spondylitis  
**Category:** IL-17 Inhibitor  
**Question Set:** `biologic_il_inhibitor` (same as Stelara)

### Approval Criteria:
- Same as Stelara
- Appropriate diagnosis with sufficient severity/duration
- Failed conventional therapy
- Negative TB and infection screening

---

## 11. Tremfya (guselkumab) - IL-23 Inhibitor

**Indication:** Psoriasis, Psoriatic Arthritis  
**Category:** IL-23 Inhibitor  
**Question Set:** `biologic_il_inhibitor` (same as Stelara)

### Approval Criteria:
- Same as Stelara
- Appropriate diagnosis with sufficient severity/duration
- Failed conventional therapy
- Negative TB and infection screening

---

## 12. Entyvio (vedolizumab) - Integrin Receptor Antagonist

**Indication:** Ulcerative Colitis, Crohn's Disease  
**Category:** Integrin Receptor Antagonist  
**Question Set:** `ibd_biologic`

### Question Flow:
1. **Primary Diagnosis**
   - Options: Crohn's Disease, Ulcerative Colitis, Other
   - **Path:** Crohn's/UC → Disease Duration
   - **Path:** Other → **DENY**

2. **Disease Duration**
   - Options: <6 months, 6-12 months, 1-2 years, >2 years
   - **Path:** <6 months → **DENY**
   - **Path:** 6+ months → Disease Severity

3. **Disease Severity**
   - Options: Mild, Moderate, Severe
   - **Path:** All → Conventional Therapy

4. **Conventional Therapy Trial**
   - Type: Yes/No
   - **Path:** Yes → List Therapies
   - **Path:** No → **DENY**

5. **List Conventional Therapies**
   - Type: Text
   - **Path:** → Previous Biologic

6. **Previous Biologic Trial**
   - Type: Yes/No
   - **Path:** Yes → List Previous Biologics
   - **Path:** No → Infection Screening

7. **List Previous Biologics**
   - Type: Text
   - **Path:** → Infection Screening

8. **Infection Screening**
   - Type: Yes/No
   - **Path:** Yes → Infection Results
   - **Path:** No → **DOCUMENTATION REQUIRED**

9. **Infection Results**
   - Options: Negative, Positive TB, Positive other, Pending
   - **Path:** Negative → **APPROVE**
   - **Path:** Positive TB/other → **DENY**
   - **Path:** Pending → **DOCUMENTATION REQUIRED**

### Approval Criteria:
- Crohn's Disease or Ulcerative Colitis
- Disease duration ≥6 months
- Failed conventional therapy (corticosteroids, immunomodulators)
- Negative TB and infection screening

---

## 13. Stelara IBD (ustekinumab) - IL-12/23 Inhibitor

**Indication:** Crohn's Disease, Ulcerative Colitis  
**Category:** IL-12/23 Inhibitor  
**Question Set:** `ibd_biologic` (same as Entyvio)

### Approval Criteria:
- Same as Entyvio
- Crohn's Disease or Ulcerative Colitis
- Disease duration ≥6 months
- Failed conventional therapy
- Negative TB and infection screening

---

## 14. Skyrizi IBD (risankizumab) - IL-23 Inhibitor

**Indication:** Crohn's Disease  
**Category:** IL-23 Inhibitor  
**Question Set:** `ibd_biologic` (same as Entyvio)

### Approval Criteria:
- Same as Entyvio
- Crohn's Disease
- Disease duration ≥6 months
- Failed conventional therapy
- Negative TB and infection screening

---

## 15. Rinvoq IBD (upadacitinib) - JAK Inhibitor

**Indication:** Ulcerative Colitis  
**Category:** JAK Inhibitor  
**Question Set:** `ibd_jak`

### Question Flow:
1. **Primary Diagnosis**
   - Options: Ulcerative Colitis, Crohn's Disease, Other
   - **Path:** Ulcerative Colitis → Disease Duration
   - **Path:** Crohn's Disease → **DENY** (not indicated)
   - **Path:** Other → **DENY**

2. **Disease Duration**
   - Options: <6 months, 6-12 months, 1-2 years, >2 years
   - **Path:** <6 months → **DENY**
   - **Path:** 6+ months → Disease Severity

3. **Disease Severity**
   - Options: Mild, Moderate, Severe
   - **Path:** All → Conventional Therapy

4. **Conventional Therapy Trial**
   - Type: Yes/No
   - **Path:** Yes → List Therapies
   - **Path:** No → **DENY**

5. **List Conventional Therapies**
   - Type: Text
   - **Path:** → Previous Biologic

6. **Previous Biologic Trial**
   - Type: Yes/No
   - **Path:** Yes → List Previous Biologics
   - **Path:** No → Age Check

7. **List Previous Biologics**
   - Type: Text
   - **Path:** → Age Check

8. **Age Check**
   - Type: Numeric (18-75 years)
   - **Path:** 18-75 years → Infection Screening
   - **Path:** Outside range → **DENY**

9. **Infection Screening**
   - Type: Yes/No
   - **Path:** Yes → Infection Results
   - **Path:** No → **DOCUMENTATION REQUIRED**

10. **Infection Results**
    - Options: Negative, Positive TB, Positive other, Pending
    - **Path:** Negative → **APPROVE**
    - **Path:** Positive TB/other → **DENY**
    - **Path:** Pending → **DOCUMENTATION REQUIRED**

### Approval Criteria:
- Ulcerative Colitis only (not Crohn's)
- Disease duration ≥6 months
- Failed conventional therapy
- Age 18-75 years
- Negative TB and infection screening

---

## Summary of Decision Paths

### **APPROVE** Paths:
- Meets all clinical criteria
- Appropriate diagnosis and severity/duration
- Failed conventional therapy
- No contraindications
- Negative infection screening
- Age requirements met (if applicable)

### **DENY** Paths:
- Wrong diagnosis (e.g., Type 1 Diabetes for GLP-1)
- Insufficient disease duration (<6 months)
- Insufficient severity (mild psoriasis, mild atopic dermatitis)
- No conventional therapy trial
- Age outside range (JAK inhibitors)
- Positive TB or other infections
- Contraindications present

### **DOCUMENTATION REQUIRED** Paths:
- Infection screening not completed
- Pending test results
- Incomplete clinical information

---

## Clinical Decision Logic

Each drug follows evidence-based clinical criteria that mirror real-world prior authorization requirements:

1. **Diagnosis Validation** - Ensures appropriate indication
2. **Severity Assessment** - Confirms sufficient disease burden
3. **Duration Requirements** - Ensures adequate disease history
4. **Step Therapy** - Requires conventional therapy failure
5. **Safety Screening** - Checks for contraindications and infections
6. **Age Restrictions** - Applies to certain drug classes (JAK inhibitors)

This comprehensive system demonstrates how AI voice agents can handle complex clinical decision-making while maintaining regulatory compliance and patient safety. 