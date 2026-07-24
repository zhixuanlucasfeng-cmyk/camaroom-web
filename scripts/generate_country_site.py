"""
Generates a country-specific variant of index.html/factory.html/gallery.html/
404.html for a new regional site (Nigeria, Mali, Sudan, ...), reusing
camaroom-web's proven template rather than hand-duplicating it.

Countries without a confirmed real local WhatsApp rep get ONLY the shared
Tom Yang contact (no invented placeholder number) — see the SP-137 /
237600000000 incidents in this repo's git history for why that matters.

Run: python3 scripts/generate_country_site.py --country nigeria --out /path/to/output-dir
"""
import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TOM_YANG_PHONE = "8618707737002"
TOM_YANG_LABEL_EN = "Tom Yang · 🇨🇳 China"
TOM_YANG_LABEL_FR = "Tom Yang · 🇨🇳 Chine"

COUNTRIES = {
    "nigeria": {
        "name_en": "Nigeria",
        "name_fr": "Nigeria",
        "default_lang": "en",
        "html_lang": "en",
        "has_local_contact": False,
        "currency": "NGN",
    },
    "mali": {
        "name_en": "Mali",
        "name_fr": "Mali",
        "default_lang": "fr",
        "html_lang": "fr",
        "has_local_contact": False,
        "currency": "XOF",
    },
    "sudan": {
        "name_en": "Sudan",
        "name_fr": "Sudan",
        "default_lang": "ar",
        "html_lang": "ar",
        "has_local_contact": False,
        "currency": "SDG",
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
    # CART_API_BASE points at the Cameroon-only cart Worker; CART_ENABLED is
    # forced off below for every generated site, but don't ship a dangling
    # reference to Cameroon's backend on sites that never call it.
    html = re.sub(
        r"window\.CART_API_BASE = '[^']*';",
        "window.CART_API_BASE = '';",
        html,
    )
    html = re.sub(
        r"\n  // Guarded:.*?\n  window\.CART_WHATSAPP_NUMBER = \(typeof AGENT_PHONE_2 !== 'undefined' \? AGENT_PHONE_2 : ''\);\n",
        "\n  window.CART_WHATSAPP_NUMBER = '';\n",
        html,
        flags=re.DOTALL,
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


def disable_cart(html: str) -> str:
    """Cart checkout is Cameroon-only for now — other countries don't have
    the backend deployed, so ship the flag off rather than a broken button."""
    return html.replace("const CART_ENABLED = true;", "const CART_ENABLED = false;")


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


def clear_address(html: str) -> str:
    """No confirmed local address yet — show the country name only, not an
    invented street address."""
    html = html.replace(
        '<div class="val" id="cAddr">Rue Léman, Douala, {COUNTRY}</div>'.replace("{COUNTRY}", ""),
        '',
    )
    # CONFIG.address and the visible location field: replace the fabricated
    # Douala street address with just the country name (set post country-name
    # substitution, so do this narrowly on the known literal string).
    return html


def generate_index_html(country_key: str) -> str:
    country = COUNTRIES[country_key]
    html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
    html = strip_local_contact_block(html)
    html = apply_country_name(html, country)
    html = set_default_language(html, country)
    html = disable_cart(html)
    html = set_cart_currency(html, country)
    # Fix the address field now that "Cameroon" inside it has already become
    # the new country name — drop the fabricated Douala street address,
    # keep just the country name.
    html = re.sub(
        r'(<div class="val" id="cAddr">)Rue Léman, Douala, ([^<]+)(</div>)',
        r'\1\2\3',
        html,
    )
    html = re.sub(
        r'(address:")Douala, ([^"]+)(")',
        r'\1\2\3',
        html,
    )
    return html


def generate_simple_html(filename: str, country_key: str) -> str:
    """factory.html / gallery.html / 404.html have no per-country contact
    details beyond the WhatsApp button and the country name in copy."""
    country = COUNTRIES[country_key]
    html = (REPO_ROOT / filename).read_text(encoding="utf-8")
    html = apply_country_name(html, country)
    # These pages' WhatsApp button is hardcoded to Luc Su's Cameroon number —
    # point it at the shared Tom Yang contact instead of a fabricated number.
    html = html.replace("https://wa.me/237681105611", f"https://wa.me/{TOM_YANG_PHONE}")
    return html


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", required=True, choices=list(COUNTRIES.keys()))
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "index.html").write_text(generate_index_html(args.country), encoding="utf-8")
    for fname in ("factory.html", "gallery.html", "404.html"):
        (args.out / fname).write_text(generate_simple_html(fname, args.country), encoding="utf-8")
    print(f"Generated {args.country} site -> {args.out}")


if __name__ == "__main__":
    main()
