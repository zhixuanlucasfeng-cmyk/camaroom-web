"""
Generates a country-specific variant of index.html/factory.html/gallery.html/
404.html for a new regional site (Nigeria, Mali, Sudan, ...), reusing
camaroom-web's proven template rather than hand-duplicating it.

Countries without a confirmed real local WhatsApp rep get ONLY the shared
Tom Yang contact (no invented placeholder number) — see the SP-137 /
237600000000 incidents in this repo's git history for why that matters.

A country with a confirmed rep sets "local_contact" (replaces the Luc Su
slot — the contact-direct row, wa-big button, AGENT_PHONE_2, and the chat
widget's "Send to X" button) and/or "sales_contact" (replaces the Tom Yang
slot the same way). Both are optional and independent — see Nigeria (both
slots replaced) and Sudan (only local_contact set, Tom Yang kept) below.

Run: python3 scripts/generate_country_site.py --country nigeria --out /path/to/output-dir
"""
import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TOM_YANG_PHONE = "8618707737002"
TOM_YANG_LABEL_EN = "Tom Yang · 🇨🇳 China"
TOM_YANG_LABEL_FR = "Tom Yang · 🇨🇳 Chine"
DROP_SALES_CONTACT = "drop"  # sentinel for apply_sales_contact — see below

COUNTRIES = {
    "nigeria": {
        "name_en": "Nigeria",
        "name_fr": "Nigeria",
        "default_lang": "en",
        "html_lang": "en",
        "currency": "NGN",
        "cart_backend": None,
        # Confirmed 2026-08-13 — see Nigeria-website git history (commit
        # "Add real Nigeria sales contacts and store address").
        "local_contact": {"name": "Bright", "flag": "🇳🇬", "label": "Nigeria", "phone": "2349063612011", "phone_display": "+234 906 361 2011"},
        "sales_contact": {"name": "James", "flag": "🇨🇳", "label": "China sales", "phone": "2349161101749", "phone_display": "+234 916 110 1749"},
        "address": "RESTAR SOLAR ENERGY NIGERIA CO LTD, No 22 Olojo Drive, by Church Bus Stop, Ojo - Alaba International Market Road, Ojo Town, Ojo Local Government Area, Lagos State, Nigeria",
    },
    "mali": {
        "name_en": "Mali",
        "name_fr": "Mali",
        "default_lang": "fr",
        "html_lang": "fr",
        "currency": "XOF",
        # Deployed 2026-07-24 (see backend/wrangler.mali.toml) — keep this in
        # sync with the live Worker URL, and with Mali-website/index.html in
        # the separate sibling repo, if either ever changes.
        "cart_backend": "https://camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev",
        # No single static local_contact — Mali's local side is a 5-person
        # rep pool (Yamadou, Mamadou Keita, Ousman Maiga, Ouattara Ousmane,
        # Papa Job Diarra; seeded in backend/scripts/seed_mali_sales_reps.sql)
        # assigned per-session by the /api/sales-rep backend call below, not
        # a single named badge on the page.
        "local_contact": None,
        # Confirmed 2026-08-13 — Elena is Mali's China-sales contact,
        # replacing the shared Tom Yang fallback.
        "sales_contact": {"name": "Elena", "flag": "🇨🇳", "label": "China sales", "phone": "8615851496160", "phone_display": "+86 158 5149 6160"},
        # Confirmed 2026-08-13.
        "address": "Sis à l'immeuble à Sotuba Rond-Point, près de Shell, Bamako, Mali",
    },
    "sudan": {
        "name_en": "Sudan",
        "name_fr": "Sudan",
        "default_lang": "ar",
        "html_lang": "ar",
        "currency": "SDG",
        "cart_backend": None,
        # Confirmed 2026-08-13 — Sudan has no store yet, only this expat
        # rep (see Sudan-website git history, "Add Zhang Gang as Sudan
        # expat sales contact"). The +86 number is the one he actually
        # uses for WhatsApp; +249 91 534 8323 is shown as a secondary,
        # unconfirmed-for-WhatsApp line.
        "local_contact": {
            "name": "Zhang Gang", "flag": "🇸🇩", "label": "Sudan",
            "phone": "8618825187185", "phone_display": "+86 188 2518 7185",
            "secondary_phone_display": "+249 91 534 8323",
        },
        # 2026-08-13: user asked to remove Tom Yang from Sudan's site ("Tom
        # is Cameroon's") — no replacement China-sales contact, just Zhang
        # Gang alone. See DROP_SALES_CONTACT / drop_sales_contact_block.
        "sales_contact": DROP_SALES_CONTACT,
        "address": None,
    },
}


def strip_local_contact_block(html: str) -> str:
    """Remove the Luc Su (Cameroon-specific) contact row, button, and its
    WhatsApp-order-routing counterpart, leaving only the shared Tom Yang
    contact — since no real local rep number exists for the new country yet."""
    # Contact section: the "Luc Su" info row (icon + label + wa.me link)
    html = re.sub(
        r'\s*<!-- Luc Su.*?</div>\s*</div>\s*<!-- Tom Yang',
        '\n          <!-- Tom Yang',
        html,
        flags=re.DOTALL,
    )
    # Contact section: the big "WhatsApp Luc Su (Cameroon)" button. Remove
    # it, and promote the remaining Tom Yang button from secondary
    # (btn--ghost) to primary (btn--sun) styling since it's now the only option.
    html = re.sub(
        r'\s*<a class="btn btn--sun wa-big" href="https://wa\.me/237681105611"[^>]*>.*?</a>\s*(?=<a class="btn btn--ghost wa-big")',
        '\n          ',
        html,
        flags=re.DOTALL,
    )
    html = html.replace('class="btn btn--ghost wa-big"', 'class="btn btn--sun wa-big"')
    # JS: AGENT_PHONE_2 declaration and the "Send to Luc Su" chat-order button.
    # window.CART_WHATSAPP_NUMBER reads AGENT_PHONE_2 (guarded with a typeof
    # check in index.html so it can't throw), but strip it here too so the
    # generated output doesn't carry a pointless reference to a var that no
    # longer exists on this site.
    #
    # Matched narrowly on the AGENT_PHONE_2 line alone (not bundled with
    # neighboring lines like CART_API_BASE) so this survives unrelated edits
    # to that line — see the SP-137-adjacent "dangling AGENT_PHONE_2" incident
    # in this repo's git history for why a wider match silently broke before.
    html = re.sub(
        r"\n  var AGENT_PHONE_2 = '237681105611'; // Luc Su \(Cameroon\)",
        "",
        html,
    )
    html = html.replace(
        "var AGENT_PHONE = '8618707737002';   // Tom Yang (China)\n",
        "var AGENT_PHONE = '8618707737002';   // Tom Yang (China) — shared contact until a local rep is confirmed\n",
    )
    # CART_API_BASE/CART_ENABLED are set per-country by set_cart_backend()
    # below, not here — this function only strips the dangling Cameroon
    # Worker URL reference so it's never briefly present mid-pipeline.
    html = re.sub(
        r"window\.CART_API_BASE = '[^']*';",
        "window.CART_API_BASE = '';",
        html,
    )
    # Strip only the AGENT_PHONE_2-specific guard comment (5 lines, exact
    # text) — narrowly anchored so it can never reach past the
    # window.CART_SESSION_ID line Task 1 added right after it.
    html = re.sub(
        r"\n  // Guarded: the country-site generator strips the AGENT_PHONE_2 declaration\n"
        r"  // above for countries without a local rep \(see strip_local_contact_block\(\)\n"
        r"  // in scripts/generate_country_site\.py\), which would otherwise leave this a\n"
        r"  // dangling reference and throw a ReferenceError that aborts this whole\n"
        r"  // script block \(breaking the chat widget below it\) on page load\.\n",
        "\n",
        html,
    )
    # Strip the AGENT_PHONE_2 ternary down to the plain AGENT_PHONE fallback
    # — single-line match, cannot span into neighboring statements.
    html = re.sub(
        r"window\.CART_WHATSAPP_NUMBER = \(typeof AGENT_PHONE_2 !== 'undefined' \? AGENT_PHONE_2 : AGENT_PHONE\);",
        "window.CART_WHATSAPP_NUMBER = AGENT_PHONE;",
        html,
    )
    html = html.replace(
        "      var waUrl1 = 'https://wa.me/' + AGENT_PHONE_2 + '?text=' + waText;\n"
        "      var waUrl2 = 'https://wa.me/' + AGENT_PHONE + '?text=' + waText;\n",
        "      var waUrl2 = 'https://wa.me/' + AGENT_PHONE + '?text=' + waText;\n",
    )
    html = html.replace(
        "        '<a href=\"' + waUrl1 + '\" target=\"_blank\" style=\"' + btnStyle + '\">' + waIcon + 'Send to Luc Su 🇨🇲</a>' +\n",
        "",
    )
    return html


def apply_local_contact(html: str, country: dict) -> str:
    """Fill the "Luc Su" slot (contact row, wa-big button, AGENT_PHONE_2,
    chat "Send to X" button) with the country's confirmed local_contact, or
    strip it entirely (existing strip_local_contact_block behavior) if none
    is confirmed yet."""
    contact = country.get("local_contact")
    if contact is None:
        return strip_local_contact_block(html)

    name, flag, label = contact["name"], contact["flag"], contact["label"]
    phone, phone_display = contact["phone"], contact["phone_display"]

    html = html.replace("<!-- Luc Su — Cameroon local -->", f"<!-- {name} — {label} local -->")
    html = html.replace("Luc Su · 🇨🇲 Cameroon", f"{name} · {flag} {label}")
    html = html.replace("https://wa.me/237681105611", f"https://wa.me/{phone}")
    html = html.replace("+237 681 105 611", phone_display)
    html = html.replace("WhatsApp Luc Su (Cameroon)", f"WhatsApp {name} ({label})")
    html = html.replace(
        "var AGENT_PHONE_2 = '237681105611'; // Luc Su (Cameroon)",
        f"var AGENT_PHONE_2 = '{phone}'; // {name} ({label})",
    )
    html = html.replace("Send to Luc Su 🇨🇲", f"Send to {name} {flag}")

    secondary = contact.get("secondary_phone_display")
    if secondary:
        # Adds a second, non-clickable line under the primary WhatsApp
        # number — e.g. a confirmed local landline that isn't confirmed to
        # be WhatsApp-reachable, so it must never become a wa.me link.
        html = html.replace(
            f'<a class="val" href="https://wa.me/{phone}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">{phone_display}</a>\n            </div>',
            f'<a class="val" href="https://wa.me/{phone}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">{phone_display}</a>\n'
            f'              <div class="val" style="font-weight:400;font-size:13px;color:var(--muted-2)">{secondary}</div>\n            </div>',
        )
    return html


def drop_sales_contact_block(html: str, local_contact: dict) -> str:
    """Remove the Tom Yang slot entirely, with no fallback shared contact
    — used when a country has a confirmed local_contact and explicitly
    wants Tom Yang gone (e.g. Sudan, 2026-08-13: "Tom is Cameroon's,
    remove him"). Promotes AGENT_PHONE_2 to take over as the sole
    AGENT_PHONE/AGENT_LABEL, mirroring what strip_local_contact_block does
    for the opposite slot."""
    name, flag = local_contact["name"], local_contact["flag"]

    # Contact section: the whole Tom Yang row (icon + label + wa.me link).
    html = re.sub(
        r'\n\s*<!-- Tom Yang — China sales -->\n\s*<div class="row">\n'
        r'\s*<div class="ic">.*?</div>\n\s*<div>\n'
        r'\s*<div class="lbl">Tom Yang · 🇨🇳 China</div>\n'
        rf'\s*<a class="val" href="https://wa\.me/{TOM_YANG_PHONE}"[^>]*>\+86 187 0773 7002</a>\n'
        r'\s*</div>\n\s*</div>\n',
        '\n',
        html, count=1, flags=re.DOTALL,
    )
    # Contact section: the Tom Yang wa-big button. It's still "btn--ghost"
    # here (strip_local_contact_block never ran, since local_contact is
    # set) — the local contact's button is already "btn--sun"/primary, so
    # nothing needs promoting once this is gone.
    html = re.sub(
        rf'\n\s*<a class="btn btn--ghost wa-big" href="https://wa\.me/{TOM_YANG_PHONE}"[^>]*>\n'
        r'\s*<svg[^>]*>.*?</svg>\n'
        r'\s*<span>WhatsApp Tom Yang \(China\)</span>\n'
        r'\s*</a>\n',
        '\n',
        html, count=1, flags=re.DOTALL,
    )
    # JS: drop the Tom Yang AGENT_PHONE/AGENT_LABEL, then promote
    # AGENT_PHONE_2 to be the sole AGENT_PHONE/AGENT_LABEL.
    html = re.sub(
        rf"  var AGENT_PHONE = '{TOM_YANG_PHONE}';   // Tom Yang \(China\)[^\n]*\n"
        r"  var AGENT_LABEL = '[^']*';[^\n]*\n"
        r"  var AGENT_PHONE_2 = '([^']+)'; // [^\n]+\n",
        f"  var AGENT_PHONE = '\\1';   // {name} ({local_contact['label']})\n"
        f"  var AGENT_LABEL = '{name} {flag}';\n",
        html, count=1,
    )
    html = html.replace(
        "window.CART_WHATSAPP_NUMBER = (typeof AGENT_PHONE_2 !== 'undefined' ? AGENT_PHONE_2 : AGENT_PHONE);",
        "window.CART_WHATSAPP_NUMBER = AGENT_PHONE;",
    )
    # These two guard/context comments only make sense when AGENT_PHONE_2
    # is genuinely still a separate var (dual-contact countries like
    # Nigeria) — here it's been folded into AGENT_PHONE above, so leaving
    # them in would misleadingly describe logic that no longer exists.
    html = re.sub(
        r"  // Guarded: the country-site generator strips the AGENT_PHONE_2 declaration\n"
        r"  // above for countries without a local rep \(see strip_local_contact_block\(\)\n"
        r"  // in scripts/generate_country_site\.py\), which would otherwise leave this a\n"
        r"  // dangling reference and throw a ReferenceError that aborts this whole\n"
        r"  // script block \(breaking the chat widget below it\) on page load\.\n",
        "",
        html,
    )
    html = re.sub(
        r"  // Falls back to Tom Yang \(real, shared contact — never a fabricated\n"
        r"  // number, see SP-137 in generate_country_site\.py\) instead of an empty\n"
        r"  // string, which previously produced a broken https://wa\.me/\?text=\.\.\. link\n"
        r"  // for any country without a local rep\.\n",
        "",
        html,
    )
    # Chat widget: drop the Tom Yang waUrl2/"Send to X" line, keep only the
    # (now-sole) AGENT_PHONE-based one, using the already-dynamic AGENT_LABEL.
    html = html.replace(
        "      var waUrl1 = 'https://wa.me/' + AGENT_PHONE_2 + '?text=' + waText;\n"
        "      var waUrl2 = 'https://wa.me/' + AGENT_PHONE + '?text=' + waText;\n",
        "      var waUrl2 = 'https://wa.me/' + AGENT_PHONE + '?text=' + waText;\n",
    )
    html = re.sub(
        rf"        '<a href=\"' \+ waUrl1 \+ '\" target=\"_blank\" style=\"' \+ btnStyle \+ '\">' \+ waIcon \+ 'Send to {re.escape(name)} {re.escape(flag)}</a>' \+\n",
        "",
        html,
    )
    return html


def apply_sales_contact(html: str, country: dict) -> str:
    """Fill the "Tom Yang" slot the same way apply_local_contact fills the
    Luc Su slot — used when a country has its own dedicated China-sales
    liaison (e.g. Nigeria's James) instead of the shared Tom Yang contact.
    A no-op when sales_contact is unset (Tom Yang stays as-is). If
    sales_contact is DROP_SALES_CONTACT, removes Tom Yang with no
    replacement at all (see drop_sales_contact_block)."""
    contact = country.get("sales_contact")
    if contact is None:
        return html
    if contact == DROP_SALES_CONTACT:
        return drop_sales_contact_block(html, country["local_contact"])

    name, flag, label = contact["name"], contact["flag"], contact["label"]
    phone, phone_display = contact["phone"], contact["phone_display"]

    html = html.replace("<!-- Tom Yang — China sales -->", f"<!-- {name} — {label} -->")
    html = html.replace("Tom Yang · 🇨🇳 China", f"{name} · {flag} {label}")
    # NOTE: narrowly scoped to the contact-direct row/button href and the
    # AGENT_PHONE declaration below — CONFIG.whatsapp/CONFIG.phone (the
    # top contact-form target and footer number) intentionally keep the
    # shared Tom Yang number even when this override is set, matching
    # camaroom-web's own baseline behavior (Cameroon's CONFIG also always
    # points at Tom Yang regardless of which local reps are shown).
    html = html.replace(
        f'<a class="val" href="https://wa.me/{TOM_YANG_PHONE}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">+86 187 0773 7002</a>',
        f'<a class="val" href="https://wa.me/{phone}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">{phone_display}</a>',
    )
    # The button's class is "btn--ghost" in the dual-button case (local_contact
    # also set, e.g. Nigeria) but strip_local_contact_block already promotes
    # it to "btn--sun" when local_contact is unset (e.g. Mali) since it's the
    # only button left — match whichever class this country actually has.
    for btn_class in ("btn--ghost", "btn--sun"):
        html = html.replace(
            f'<a class="btn {btn_class} wa-big" href="https://wa.me/{TOM_YANG_PHONE}" target="_blank" rel="noopener" style="width:100%;justify-content:center">',
            f'<a class="btn {btn_class} wa-big" href="https://wa.me/{phone}" target="_blank" rel="noopener" style="width:100%;justify-content:center">',
        )
    html = html.replace("WhatsApp Tom Yang (China)", f"WhatsApp {name} ({label})")
    # Matches either comment variant — the plain one (local_contact set, so
    # strip_local_contact_block never ran) or the "— shared contact until a
    # local rep is confirmed" one it leaves behind (local_contact unset).
    html = re.sub(
        rf"var AGENT_PHONE = '{TOM_YANG_PHONE}';   // Tom Yang \(China\)[^\n]*",
        f"var AGENT_PHONE = '{phone}';   // {name} ({label})",
        html,
    )
    # AGENT_LABEL feeds the chat widget's "Send to X" button text and gets
    # overwritten again at runtime if a sales-rep API assigns a different
    # local rep (see the fetch below it) — this just sets its starting/
    # fallback value to match the AGENT_PHONE override above.
    html = html.replace("var AGENT_LABEL = 'Tom Yang 🇨🇳';", f"var AGENT_LABEL = '{name} {flag}';")
    return html


def apply_country_name(html: str, country: dict) -> str:
    html = html.replace("Cameroon", country["name_en"])
    html = html.replace("Cameroun", country["name_fr"])
    return html


def set_default_language(html: str, country: dict) -> str:
    dir_attr = ' dir="rtl"' if country["default_lang"] == "ar" else ""
    html = re.sub(r'<html lang="[a-z]{2}">', f'<html lang="{country["html_lang"]}"{dir_attr}>', html, count=1)
    html = html.replace('let lang = "en";', f'let lang = "{country["default_lang"]}";', 1)
    if country["default_lang"] != "en":
        html = html.replace('<button data-lang="en" class="on">EN</button>', '<button data-lang="en">EN</button>')
        html = html.replace(
            f'<button data-lang="{country["default_lang"]}">',
            f'<button data-lang="{country["default_lang"]}" class="on">',
        )
    return html


def set_cart_backend(html: str, country: dict) -> str:
    """Cart checkout is enabled only for countries with a deployed backend
    (COUNTRIES[...]["cart_backend"]) — e.g. Mali, pointed at
    camaroom-cart-backend-mali (see backend/wrangler.mali.toml). Countries
    without one (cart_backend is None) get the flag off and an empty API
    base, same as before.

    This must stay in sync with reality: if a country's cart_backend is set
    here, regenerating that country's site should reproduce its live
    CART_ENABLED/CART_API_BASE state, not silently revert it — a mismatch
    here previously caused a live-discovered bug (see 2026-07-24 Mali cart
    checkout branch history) and is exactly what this function exists to
    prevent."""
    backend_url = country.get("cart_backend")
    enabled = "true" if backend_url else "false"
    html = re.sub(r"const CART_ENABLED = (true|false);", f"const CART_ENABLED = {enabled};", html)
    html = re.sub(
        r"window\.CART_API_BASE = '[^']*';",
        f"window.CART_API_BASE = '{backend_url or ''}';",
        html,
    )
    return html


def set_cart_currency(html: str, country: dict) -> str:
    """window.CART_CURRENCY is read by assets/js/cart.js when building the
    order payload — it must match whatever ORDER_CURRENCY a country's cart
    backend deployment validates against (see backend/wrangler.mali.toml for
    the Mali example), independent of whether CART_ENABLED is currently on.
    Setting it correctly now means a later cart rollout for this country is
    just flipping CART_ENABLED, not also hunting for a hardcoded currency."""
    return html.replace(
        "window.CART_CURRENCY = 'XAF';",
        f"window.CART_CURRENCY = '{country['currency']}';",
    )


def apply_address(html: str, country: dict) -> str:
    """Use country["address"] if a real store address is confirmed;
    otherwise fall back to the bare country name (never an invented street
    address) — same rule that used to live in clear_address()."""
    address = country.get("address") or country["name_en"]
    html = re.sub(
        r'(<div class="val" id="cAddr">)Rue Léman, Douala, [^<]+(</div>)',
        lambda m: f"{m.group(1)}{address}{m.group(2)}",
        html,
    )
    html = re.sub(
        r'(address:")Douala, [^"]+(")',
        lambda m: f"{m.group(1)}{address}{m.group(2)}",
        html,
    )
    return html


def generate_index_html(country_key: str) -> str:
    country = COUNTRIES[country_key]
    html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
    html = apply_local_contact(html, country)
    html = apply_sales_contact(html, country)
    html = apply_country_name(html, country)
    html = set_default_language(html, country)
    html = set_cart_backend(html, country)
    html = set_cart_currency(html, country)
    html = apply_address(html, country)
    return html


def generate_simple_html(filename: str, country_key: str) -> str:
    """gallery.html / 404.html have no per-country contact details beyond
    the WhatsApp button and the country name in copy. (factory.html was
    retired 2026-08-13 — its "Factory" nav link now points at
    restarsolar.com/about-us/ instead, see apply_country_name callers.)"""
    country = COUNTRIES[country_key]
    html = (REPO_ROOT / filename).read_text(encoding="utf-8")
    html = apply_country_name(html, country)
    # These pages' WhatsApp button is hardcoded to Luc Su's Cameroon number.
    # Point it at the confirmed local_contact if one exists (matching how
    # camaroom-web's own factory/gallery pages point at Luc Su, not Tom
    # Yang); else the sales_contact override if one exists (e.g. Mali's
    # Elena, who replaces Tom Yang even though Mali has no single named
    # local_contact — its local side is a dynamic rep pool, not one badge);
    # else fall back to the shared Tom Yang contact.
    local_contact = country.get("local_contact")
    sales_contact = country.get("sales_contact")
    if local_contact:
        target_phone = local_contact["phone"]
    elif sales_contact:
        target_phone = sales_contact["phone"]
    else:
        target_phone = TOM_YANG_PHONE
    html = html.replace("https://wa.me/237681105611", f"https://wa.me/{target_phone}")
    return html


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", required=True, choices=list(COUNTRIES.keys()))
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "index.html").write_text(generate_index_html(args.country), encoding="utf-8")
    for fname in ("gallery.html", "404.html"):
        (args.out / fname).write_text(generate_simple_html(fname, args.country), encoding="utf-8")
    print(f"Generated {args.country} site -> {args.out}")


if __name__ == "__main__":
    main()
