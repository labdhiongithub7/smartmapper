I think your idea is good, but I would make it more structured. If you're asking an AI coding agent (Cursor, Claude Code, Codex, Windsurf, etc.) to build this, don't just say "make an AI that maps Excel." Give it a proper product specification.

Here's a prompt I'd use.

---

# AI Data Mapping Assistant - Product Specification

## Objective

Build an AI-powered web application that standardizes client Excel/CSV files into our company's predefined format.

The goal is to reduce the manual Turn Around Time (TAT) required by operations teams while keeping a human in the loop for validation.

---

## Problem Statement

Our company receives Excel sheets from multiple clients.

Every client has a different schema.

For example,

Client A

| Supplier | GSTIN | Mobile |
| -------- | ----- | ------ |

Client B

| Vendor Name | GST Number | Contact Number |

Client C

| Company | Phone | Tax ID |

But internally we always need

| Vendor Name | GST | Phone |

Currently an operations executive manually

* Opens Excel
* Understands every column
* Renames columns
* Combines/splits fields
* Removes unwanted columns
* Cleans data
* Validates
* Exports

This process takes significant time.

The system should automate as much of this process as possible.

---

# Core Idea

Instead of hardcoded mapping rules,

the system should use an LLM to understand

* the target schema
* the client schema
* the meaning of the data

and intelligently transform one into the other.

---

# Inputs

### Input 1

Company Template Excel

This represents the desired schema.

Example

```
Vendor Name
GST
Phone
Email
City
Material Category
```

---

### Input 2

Client Excel

Unknown format.

Can contain

* extra columns
* missing columns
* different names
* merged fields
* split fields
* noisy data

---

# AI Responsibilities

The AI should

### 1.

Understand the company template.

Treat this as the source of truth.

---

### 2.

Read the uploaded client Excel.

Understand

* headers
* values
* context
* data types

---

### 3.

Semantically map columns.

Example

Supplier

↓

Vendor Name

GSTIN

↓

GST

Mobile

↓

Phone

---

### 4.

Perform transformations.

Examples

First Name

*

Middle Name

*

Last Name

↓

Full Name

OR

Full Name

↓

Split into

First Name

Last Name

Normalize

* dates
* phone numbers
* GST
* emails
* capitalization

---

### 5.

Remove noise.

If columns are not present in the destination schema,

ignore them.

Example

Fax

Internal Notes

Remarks

Legacy Code

These should not appear in the output unless specifically requested.

---

### 6.

Validation

Detect

Missing mandatory fields

Invalid emails

Duplicate vendors

Invalid GST

Invalid phone numbers

---

### 7.

Confidence Score

Every mapping should have a confidence score.

Example

Supplier

↓

Vendor Name

99%

Company

↓

Vendor Name

82%

Vendor ID

↓

Vendor Name

54%

---

### 8.

Human in the loop

If confidence is below 90%

DO NOT automatically map.

Instead ask the user.

Example

"I am unsure whether 'Company' should map to Vendor Name or Customer Name."

---

### 9.

Learning

If the user corrects a mapping,

save it for this client.

Next upload should automatically reuse previous mappings.

---

# UI

Step 1

Upload company template.

↓

Step 2

Upload client Excel.

↓

Step 3

AI Mapping Screen

Show

Client Column

↓

Target Column

Confidence

Reason

---

Example

Supplier

↓

Vendor Name

99%

Detected company names.

---

GSTIN

↓

GST

100%

Matches GST format.

---

Company

↓

Vendor Name

82%

Semantic similarity.

---

Allow user to edit mappings.

---

Step 4

Preview final Excel.

Highlight changes.

---

Step 5

Download standardized Excel.

---

# LLM Prompt

The LLM should receive

```
Company Schema

Client Schema

Sample rows

Business Rules

Transformation Rules
```

Then return

```
Mappings

Confidence

Reasoning

Required Transformations

Validation Errors

Questions (if uncertain)
```

---

# Nice-to-have Features

* Explain every mapping.
* Highlight discarded columns.
* Side-by-side comparison.
* Undo changes.
* Bulk approval.
* Support multiple sheets.
* Export mapping report.
* Save client-specific templates.

---

# Tech Stack (Suggested)

* Frontend: React + Next.js
* Backend: FastAPI (Python)
* LLM: GPT-5.5 / Gemini 2.5 Pro / Claude 4
* Excel Processing: pandas + openpyxl
* Embeddings (optional): for semantic similarity if you later want to reduce LLM calls.
* Database: PostgreSQL to store client-specific mapping history.

---

### One product suggestion

Instead of calling it **"Excel Mapping Tool,"** give it a product name like **"AI Data Onboarding Assistant."** That changes the perception completely. You're no longer building a utility that renames columns; you're building an intelligent assistant that understands incoming enterprise data, standardizes it according to company rules, collaborates with users when uncertain, and continuously learns from past corrections. That's a much stronger product story and aligns well with what a company like Venwiz would appreciate.
