# AI Assistant Warranty Knowledge (rest-solar-agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the AI customer-service assistant RESTAR's official panel warranty terms so it can answer model-specific and general warranty/claims questions accurately, in the customer's language.

**Architecture:** `orchestrator.py`'s existing keyword-matching catalog retrieval (`_retrieve_catalog_context`, no embeddings — see the file's own comment about the Render free-tier OOM history) gets a per-panel warranty line appended when a solar-panel product is matched. General warranty knowledge (types, exclusions, claims process) is added to the existing hardcoded `_FAQ_CONTENT` string (this is what actually reaches the system prompt at runtime — `data/seeds/faqs_*.txt` are NOT used at runtime, only by the disconnected ChromaDB path). A new guardrail `Rule` row (DB-backed, same mechanism as the 5 existing rules) enforces the response rules (don't invent terms, ask for model number, mention 3-month claim window, etc).

**Tech Stack:** Python, SQLAlchemy (async), pytest — same as the rest of this repo. No new dependencies.

## Global Constraints

- `_FAQ_CONTENT` in `app/agent/orchestrator.py` (a hardcoded Python string) is what actually reaches the LLM's system prompt — confirmed by reading `run()`/`run_stream()`. `data/seeds/faqs_en.txt`/`faqs_fr.txt` are dead at runtime (only used by `seed.py`'s ChromaDB path, which `orchestrator.py` does not call — see the file's own comment at line 16-20). This plan edits `_FAQ_CONTENT` directly, not the seed files.
- Do NOT re-wire ChromaDB/embeddings back into `orchestrator.py` — `torch`/`sentence-transformers`/`chromadb` were deliberately removed from `requirements.txt` (commit `8c88b34`) to fix an OOM crash on Render's 512MB free tier. Stay within plain keyword matching against the `products` table.
- `Product.category` stores raw catalog values (`"solar_panels"`, `"batteries"`, etc. — verified in `scripts/ingest_catalog_2026.py`), not the site's short category keys. Warranty logic checks `p.category == "solar_panels"`.
- Full `pytest` suite must stay green (64/64 passing before this work; must not regress) after every task.
- Do not modify `seed.py` — running it re-triggers `embed_batch()`/ChromaDB calls that are only safe in the stale local `.venv` mentioned in `DONE_SUMMARY.md`, not a clean environment. The new guardrail rule is added via a standalone, idempotent script that touches only the `rules` table.
- Warranty family table (identical to the camaroom-web plan, RESTAR's official policy effective 2026-01-01):

  | Family | Model prefixes | Product years | Performance years | Output guarantee |
  |---|---|---|---|---|
  | cutting_cell | `RTM*` | 10 | 20 | ≥80.7% |
  | full_cell | `RT6S/C/D/F/E/G*` | 12 | 25 | ≥80.7% |
  | half_cell | `RT7K/I/V`, `RT8V/K/I/H/L/S/X`, `RT9Y/N/T/K/H` | 15 | 30 | ≥83% |
  | bifacial | any half_cell prefix + `-BD`/`-DG` suffix | 15 | 30 | ≥84.95% |

  RT7V/RT8H/RT8L/RT8S/RT8X are not in RESTAR's official table; per user decision (2026-07-15) they're treated as `half_cell` — internal detail only, not surfaced to customers.

---

### Task 1: Warranty family classifier

**Files:**
- Create: `app/agent/warranty.py`
- Test: `tests/test_warranty.py`

**Interfaces:**
- Produces: `classify_panel_warranty(model: str | None) -> dict | None` — returns `{"product_years": int, "performance_years": int, "output_pct_en": str, "output_pct_fr": str, "assumed": bool}` or `None`. Used by Task 2 (`orchestrator.py`).

- [ ] **Step 1: Write the failing test**

Create `tests/test_warranty.py`:

```python
from app.agent.warranty import classify_panel_warranty


def test_cutting_cell():
    r = classify_panel_warranty("RTM123P")
    assert r == {"product_years": 10, "performance_years": 20, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %", "assumed": False}


def test_full_cell():
    r = classify_panel_warranty("RT6S-M")
    assert r == {"product_years": 12, "performance_years": 25, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %", "assumed": False}


def test_half_cell_documented():
    r = classify_panel_warranty("RT8K-M")
    assert r == {"product_years": 15, "performance_years": 30, "output_pct_en": "≥83%", "output_pct_fr": "≥83 %", "assumed": False}


def test_half_cell_assumed():
    r = classify_panel_warranty("RT8H-M")
    assert r["assumed"] is True
    assert r["product_years"] == 15
    assert r["performance_years"] == 30


def test_bifacial_suffix():
    r = classify_panel_warranty("RT8I-M-DG")
    assert r == {"product_years": 15, "performance_years": 30, "output_pct_en": "≥84.95%", "output_pct_fr": "≥84,95 %", "assumed": False}


def test_bifacial_assumed():
    r = classify_panel_warranty("RT8H-M-BD")
    assert r["output_pct_en"] == "≥84.95%"
    assert r["assumed"] is True


def test_none_and_empty():
    assert classify_panel_warranty(None) is None
    assert classify_panel_warranty("") is None


def test_non_panel_model():
    assert classify_panel_warranty("HH3.6KS") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest tests/test_warranty.py -v`
Expected: `ModuleNotFoundError: No module named 'app.agent.warranty'`

- [ ] **Step 3: Write the implementation**

Create `app/agent/warranty.py`:

```python
"""
Classifies a RESTAR solar panel model number into its official warranty
family, per "RESTAR Limited Manufacturer's Warranty for Crystalline Solar
Photovoltaic Modules" (effective 2026-01-01).

RT7V/RT8H/RT8L/RT8S/RT8X are real catalog model prefixes not listed in
RESTAR's official family table. Per user decision (2026-07-15), they are
treated as the same "half_cell" family as the documented RT7/RT8 models
(same generation, same 15yr/30yr/83% terms), flagged `assumed: True` so
they can be corrected later without re-deriving the rest of the catalog.
This flag is for internal/data purposes only — never surface it to
customers in a chat reply.
"""
import re

WARRANTY_FAMILIES = {
    "cutting_cell": {"product_years": 10, "performance_years": 20, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %"},
    "full_cell":    {"product_years": 12, "performance_years": 25, "output_pct_en": "≥80.7%", "output_pct_fr": "≥80,7 %"},
    "half_cell":    {"product_years": 15, "performance_years": 30, "output_pct_en": "≥83%",   "output_pct_fr": "≥83 %"},
    "bifacial":     {"product_years": 15, "performance_years": 30, "output_pct_en": "≥84.95%", "output_pct_fr": "≥84,95 %"},
}

_FULL_CELL_PREFIXES = ("RT6S", "RT6C", "RT6D", "RT6F", "RT6E", "RT6G")
_HALF_CELL_PREFIXES = ("RT7K", "RT7I", "RT7V", "RT8V", "RT8K", "RT8I", "RT8H", "RT8L", "RT8S", "RT8X", "RT9Y", "RT9N", "RT9T", "RT9K", "RT9H")
_HALF_CELL_ASSUMED = ("RT7V", "RT8H", "RT8L", "RT8S", "RT8X")

_MODEL_RE = re.compile(r"RT[A-Z0-9-]+")


def classify_panel_warranty(model: str | None) -> dict | None:
    """Return the warranty dict for a panel model, or None if unrecognized."""
    if not model:
        return None
    upper = model.upper()
    match = _MODEL_RE.search(upper)
    if not match:
        return None
    m = match.group(0)

    if m.startswith("RTM"):
        family = "cutting_cell"
    elif m.startswith(_FULL_CELL_PREFIXES):
        family = "full_cell"
    elif m.startswith(_HALF_CELL_PREFIXES):
        family = "bifacial" if ("-BD" in m or "-DG" in m) else "half_cell"
    else:
        return None

    result = dict(WARRANTY_FAMILIES[family])
    result["assumed"] = any(m.startswith(p) for p in _HALF_CELL_ASSUMED)
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest tests/test_warranty.py -v`
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add app/agent/warranty.py tests/test_warranty.py
git commit -m "Add RESTAR panel warranty family classifier"
```

---

### Task 2: Wire warranty into catalog context retrieval

**Files:**
- Modify: `app/agent/orchestrator.py:11` (import), `app/agent/orchestrator.py:112-124` (`_retrieve_catalog_context`)
- Test: `tests/test_orchestrator.py` (new test)

**Interfaces:**
- Consumes: `classify_panel_warranty(model: str | None) -> dict | None` from Task 1.
- Produces: `_retrieve_catalog_context()` now includes a `Warranty: ...` clause in each solar-panel product's line — no signature change, existing callers (`run()`, `run_stream()`) are unaffected.

- [ ] **Step 1: Write the failing test**

In `tests/test_orchestrator.py`, add (after the existing imports at the top of the file):

```python
from app.agent.orchestrator import _retrieve_catalog_context
from app.db.models import Product
```

Then add this test function (near the other `async def test_...` functions):

```python
async def test_catalog_context_includes_panel_warranty(db_with_rules):
    db_with_rules.add(Product(
        name="RT8K-M", sku="SP-TEST-1", category="solar_panels",
        model="RT8K-M", wattage="440-465W",
    ))
    await db_with_rules.commit()
    context = await _retrieve_catalog_context("RT8K-M panel warranty", db_with_rules)
    assert "Warranty: 15-year product warranty" in context
    assert "30-year performance warranty" in context
    assert "≥83% output guaranteed" in context


async def test_catalog_context_no_warranty_for_battery(db_with_rules):
    db_with_rules.add(Product(
        name="RF12-100A", sku="BAT-TEST-1", category="batteries",
        model="RF12-100A", capacity_ah="100Ah",
    ))
    await db_with_rules.commit()
    context = await _retrieve_catalog_context("RF12-100A battery", db_with_rules)
    assert "Warranty:" not in context
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest tests/test_orchestrator.py -k warranty -v`
Expected: `AssertionError` on `"Warranty: 15-year product warranty" in context` (not present yet)

- [ ] **Step 3: Write the implementation**

In `app/agent/orchestrator.py`, change the import line (currently line 11):

```python
from app.db.models import Conversation, Message, Product
```

to:

```python
from app.db.models import Conversation, Message, Product
from app.agent.warranty import classify_panel_warranty
```

Then replace the `lines` loop inside `_retrieve_catalog_context` (currently lines 112-123):

```python
    lines = []
    for _, p in top:
        specs = ", ".join(filter(None, [
            p.wattage, p.power_kw, p.capacity_ah, p.capacity_kwh,
            f"voltage {p.voltage}" if p.voltage else None,
            f"dimensions {p.dimensions}" if p.dimensions else None,
        ]))
        feats = f" Features: {p.features}." if p.features else ""
        lines.append(
            f"- {p.model} ({p.category}{'/' + p.subcategory if p.subcategory else ''}, SKU {p.sku}): "
            f"{specs}.{feats} Price on request — datasheet available."
        )
    return "2026 catalog matches for this question:\n" + "\n".join(lines)
```

with:

```python
    lines = []
    for _, p in top:
        specs = ", ".join(filter(None, [
            p.wattage, p.power_kw, p.capacity_ah, p.capacity_kwh,
            f"voltage {p.voltage}" if p.voltage else None,
            f"dimensions {p.dimensions}" if p.dimensions else None,
        ]))
        feats = f" Features: {p.features}." if p.features else ""
        warranty_note = ""
        if p.category == "solar_panels":
            w = classify_panel_warranty(p.model)
            if w:
                warranty_note = (
                    f" Warranty: {w['product_years']}-year product warranty, "
                    f"{w['performance_years']}-year performance warranty "
                    f"({w['output_pct_en']} output guaranteed)."
                )
        lines.append(
            f"- {p.model} ({p.category}{'/' + p.subcategory if p.subcategory else ''}, SKU {p.sku}): "
            f"{specs}.{feats}{warranty_note} Price on request — datasheet available."
        )
    return "2026 catalog matches for this question:\n" + "\n".join(lines)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest tests/test_orchestrator.py -k warranty -v`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add app/agent/orchestrator.py tests/test_orchestrator.py
git commit -m "Include panel warranty terms in catalog context retrieval"
```

---

### Task 3: Add general warranty knowledge to the FAQ content

**Files:**
- Modify: `app/agent/orchestrator.py:126-156` (`_FAQ_CONTENT`)

**Interfaces:** none (module-level constant, no signature change).

- [ ] **Step 1: Replace `_FAQ_CONTENT`**

In `app/agent/orchestrator.py`, replace the entire `_FAQ_CONTENT` block (currently lines 126-156) with:

```python
_FAQ_CONTENT = """
Q: What solar panel sizes do you sell?
A: We stock monocrystalline solar panels ranging from 50W to 550W. Our most popular sizes for homes are the 200W and 330W panels, while the 450W and 550W panels are preferred for businesses and borehole pumping systems.

Q: What warranty do your batteries come with?
A: Our lithium LiFePO4 batteries carry a 2-year warranty against manufacturing defects. Tubular gel batteries carry a 1-year warranty. All warranty claims must be accompanied by proof of purchase and installation documentation.

Q: What warranty do RESTAR solar panels come with?
A: Every RESTAR panel carries two manufacturer warranties: a product warranty (10 to 15 years against defects in material and workmanship, depending on panel type) and a performance warranty (20 to 30 years, guaranteeing 80.7% to 84.95% of rated power output). If your panel is damaged or underperforming, contact us on WhatsApp with the serial number, photos, and proof of purchase — RESTAR must be notified within 3 months of the defect being discovered. Storm, lightning, flood damage, improper installation, and unauthorized repairs are not covered.

Q: Do you deliver to cities outside Douala?
A: Yes, we deliver across Cameroon including Yaoundé, Bafoussam, Bamenda, Garoua, Maroua, Bertoua, and all major cities. Delivery times and costs vary by location. Contact us for a quote specific to your area.

Q: How long does a shipment from China take?
A: Sea freight from our factory in China to Douala port typically takes 30 to 45 days, depending on vessel schedules and port clearance. We also offer faster air freight for urgent orders, which takes 7 to 10 days at higher cost.

Q: What is the Cameroon import duty on solar panels?
A: As of our most recent information, solar panels are classified under HS code 8541.40 and attract a 10% import duty plus 19.25% VAT on the CIF value. These rates can change — always verify with a licensed customs broker before importing.

Q: Quelles tailles de panneaux solaires vendez-vous ?
R: Nous proposons des panneaux solaires monocristallins de 50W à 550W. Les tailles les plus populaires pour les foyers sont les panneaux 200W et 330W, tandis que les panneaux 450W et 550W sont privilégiés pour les entreprises et les systèmes de pompage de forage.

Q: Quelle garantie offrez-vous sur les batteries ?
R: Nos batteries lithium LiFePO4 bénéficient d'une garantie de 2 ans contre les défauts de fabrication. Les batteries tubulaires gel bénéficient d'une garantie d'un an. Toute demande de garantie doit être accompagnée d'un justificatif d'achat et d'une documentation d'installation.

Q: Quelle garantie couvre les panneaux solaires RESTAR ?
R: Chaque panneau RESTAR bénéficie de deux garanties du fabricant : une garantie produit (10 à 15 ans contre les défauts de matériau et de fabrication, selon le type de panneau) et une garantie de performance (20 à 30 ans, garantissant 80,7 % à 84,95 % de la puissance nominale). En cas de panneau endommagé ou sous-performant, contactez-nous sur WhatsApp avec le numéro de série, des photos et une preuve d'achat — RESTAR doit être informé dans les 3 mois suivant la découverte du défaut. Les dommages liés aux intempéries, à la foudre, aux inondations, à une installation incorrecte ou à des réparations non autorisées ne sont pas couverts.

Q: Livrez-vous en dehors de Douala ?
R: Oui, nous livrons partout au Cameroun, notamment à Yaoundé, Bafoussam, Bamenda, Garoua, Maroua, Bertoua et dans toutes les grandes villes. Les délais et frais de livraison varient selon la localisation. Contactez-nous pour un devis adapté à votre zone.

Q: Combien de temps prend une expédition depuis la Chine ?
R: Le fret maritime depuis notre usine en Chine jusqu'au port de Douala prend généralement 30 à 45 jours, selon les plannings des navires et le dédouanement. Nous proposons également le fret aérien pour les commandes urgentes, avec un délai de 7 à 10 jours, à un coût plus élevé.

Q: Quels sont les droits d'importation au Cameroun pour les panneaux solaires ?
R: Selon nos dernières informations, les panneaux solaires sont classés sous le code SH 8541.40 et sont soumis à 10 % de droits d'importation plus 19,25 % de TVA sur la valeur CAF. Ces taux peuvent évoluer — vérifiez toujours auprès d'un transitaire agréé avant toute importation.
""".strip()
```

(Only the two new Q&A blocks — English after the existing battery-warranty Q&A, French after the existing French battery-warranty Q&A — are new; everything else is unchanged, copied verbatim to keep the constant intact.)

- [ ] **Step 2: Verify the module still imports cleanly**

Run: `PYTHONPATH=. .venv/bin/python3 -c "from app.agent.orchestrator import _FAQ_CONTENT; assert 'RESTAR panels come with' in _FAQ_CONTENT; assert 'garanties du fabricant' in _FAQ_CONTENT; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Run the full test suite**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest -v`
Expected: all tests pass, no regressions (this is a data-only change to a string constant).

- [ ] **Step 4: Commit**

```bash
git add app/agent/orchestrator.py
git commit -m "Add general RESTAR panel warranty Q&A to assistant FAQ content"
```

---

### Task 4: Add the panel-warranty guardrail rule

**Files:**
- Create: `scripts/add_warranty_rule.py`
- Test: manual (DB-mutation script; verified via Step 3 below, no pytest needed since this only touches a data script, not app code)

**Interfaces:** none (standalone script, run once).

- [ ] **Step 1: Write the script**

Create `scripts/add_warranty_rule.py`:

```python
"""
One-time, idempotent: adds the panel-warranty guardrail Rule to the DB.
Deliberately separate from seed.py, which also tries to (re-)embed FAQ
files into ChromaDB — a path that ImportErrors in a clean environment
since torch/sentence-transformers/chromadb were removed from
requirements.txt (see DONE_SUMMARY.md / commit 8c88b34). This script only
touches the `rules` table.

Run: PYTHONPATH=. .venv/bin/python3 scripts/add_warranty_rule.py
"""
import asyncio
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import Rule

RULE = {
    "name": "panel_warranty",
    "trigger": "warranty/guarantee/broken/defect/claim/garantie/défaut/panne/réclamation/cassé",
    "body": (
        "For solar PANEL (not battery) warranty questions: RESTAR's official "
        "policy (effective 2026-01-01) gives every panel two warranties "
        "starting from the purchase date — a product-defect warranty (10-15 "
        "years depending on panel type) and a performance warranty (20-30 "
        "years, guaranteeing 80.7%-84.95% of rated output). Give the exact "
        "figures from the retrieved catalog match for the specific model "
        "asked about. If the model isn't identified, state the general range "
        "(10-15 year product / 20-30 year performance) and ask for the model "
        "number printed on the panel's label — never invent exact figures "
        "for an unidentified model. For a broken/defective panel, tell the "
        "customer to contact Rest Solar on WhatsApp with the panel's serial "
        "number, photos of the issue, and proof of purchase; warn them not "
        "to remove or damage the serial number label; and note that RESTAR "
        "must be notified within 3 months of discovering the defect. "
        "Mention honestly when damage sounds excluded (e.g. lightning, "
        "flood, storm, improper installation, and unauthorized repairs are "
        "NOT covered). If unsure about any warranty detail, say a human "
        "from Rest Solar will confirm rather than guessing."
    ),
    "priority": 3,
}


async def main():
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(Rule.name))).scalars().all()
        if RULE["name"] in existing:
            print(f"Rule '{RULE['name']}' already exists — skipping.")
            return
        db.add(Rule(**RULE))
        await db.commit()
        print(f"Rule '{RULE['name']}' added.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run it against the local dev DB**

Run: `PYTHONPATH=. .venv/bin/python3 scripts/add_warranty_rule.py`
Expected: `Rule 'panel_warranty' added.`

- [ ] **Step 3: Verify it's idempotent**

Run: `PYTHONPATH=. .venv/bin/python3 scripts/add_warranty_rule.py` again.
Expected: `Rule 'panel_warranty' already exists — skipping.`

- [ ] **Step 4: Verify the rule is retrievable via the existing rule engine**

Run: `PYTHONPATH=. .venv/bin/python3 -c "
import asyncio
from app.db.session import AsyncSessionLocal
from app.agent.rule_engine import get_matching_rules

async def check():
    async with AsyncSessionLocal() as db:
        matched = await get_matching_rules('what is the warranty on my panel', db)
        assert any('panel_warranty' not in m and 'RESTAR' in m for m in matched) or any('10-15' in m for m in matched), matched
        print('OK:', len(matched), 'rules matched')

asyncio.run(check())
"`
Expected: `OK: N rules matched` where N includes the new rule (the exact count depends on how many other rules also trigger on generic keywords — the assertion just confirms the warranty rule's body text is present in the matched set).

- [ ] **Step 5: Commit**

```bash
git add scripts/add_warranty_rule.py
git commit -m "Add panel_warranty guardrail rule (idempotent script)"
```

---

### Task 5: Regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `PYTHONPATH=. .venv/bin/python3 -m pytest -v`
Expected: all tests pass (the pre-existing 64, plus 8 from Task 1's `test_warranty.py`, plus 2 from Task 2 — 74 total), zero failures.

- [ ] **Step 2: Confirm the app still boots cleanly**

Run: `PYTHONPATH=. .venv/bin/python3 -c "import app.main; print('OK: app imports cleanly')"`
Expected: `OK: app imports cleanly` (no `ImportError` for torch/chromadb/sentence_transformers — confirms Task 2/3 didn't accidentally reintroduce the disconnected RAG path).

No commit — this task only verifies Tasks 1-4, which are already committed.

---

### Task 6: Live verification against the running server

**Files:** none (manual verification only, matching the original request's ask for 3 sample Q&As)

- [ ] **Step 1: Start the local server**

Run: `PYTHONPATH=. .venv/bin/uvicorn app.main:app --reload` (in the background/a separate terminal)

- [ ] **Step 2: Ask an RT9-panel warranty question**

Run: `curl -s -X POST http://127.0.0.1:8000/api/chat -H "Content-Type: application/json" -d '{"message": "What warranty comes with the RT9H panel?", "session_id": "verify-1"}'`

Expected: the reply states the half-cell family terms — 15-year product warranty, 30-year performance warranty, ≥83% output guaranteed — without inventing different numbers.

- [ ] **Step 3: Ask a broken-panel claims question**

Run: `curl -s -X POST http://127.0.0.1:8000/api/chat -H "Content-Type: application/json" -d '{"message": "My solar panel stopped working properly, what do I do?", "session_id": "verify-2"}'`

Expected: the reply tells the customer to contact Rest Solar on WhatsApp with the serial number, photos, and proof of purchase, and mentions the 3-month reporting window — without asking them to return the panel directly to RESTAR.

- [ ] **Step 4: Ask in French**

Run: `curl -s -X POST http://127.0.0.1:8000/api/chat -H "Content-Type: application/json" -d '{"message": "Quelle est la garantie sur les panneaux solaires ?", "session_id": "verify-3"}'`

Expected: the reply is in French and states the general warranty range (or specific figures if a model was inferable), consistent with the FR FAQ content added in Task 3.

- [ ] **Step 5: Stop the local server**

Stop the `uvicorn` process (Ctrl-C or kill the background job).

No commit — this task only verifies live behavior of already-committed work (Tasks 1-4).
