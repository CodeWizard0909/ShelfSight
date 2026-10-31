"""Static config: platforms we scan and the Bangalore pincodes on the map."""

from urllib.parse import quote_plus

# Agents start on the search page so they skip the homepage hops.
# max_seconds: hard cap per run, set from measured successful runs (Blinkit 42-164s, Zepto 105-316s, BigBasket 194-736s)
PLATFORMS = {
    "blinkit": {"name": "Blinkit", "search": "https://blinkit.com/s/?q={q}", "color": "#f8cb46", "max_seconds": 200},
    "zepto": {"name": "Zepto", "search": "https://www.zeptonow.com/search?query={q}", "color": "#8b3dff", "max_seconds": 330},
    "bigbasket": {"name": "BigBasket", "search": "https://www.bigbasket.com/ps/?q={q}", "color": "#84c225", "max_seconds": 240},
    # Instamart's search page has no location bar, so start on its home page and search from there.
    # 300s: successful runs took 24-38 steps; 200s cut Koramangala off right after the location step
    "instamart": {"name": "Instamart", "search": "https://www.swiggy.com/instamart", "color": "#fc8019", "max_seconds": 300},
}

# Exact location + search steps, copied from a run that worked (agents got lost without them)
PLATFORM_STEPS = {
    "instamart": (
        '2. Set the delivery location: click "Add your location" at the top left, next to the instamart logo. '
        'In the popup "Share location to find the closest Instamart store", click the box "Search for an area or address" '
        '(not the blue "Share location" button), type {pincode}, and click the first suggestion. '
        'On the map page that opens, click the blue "Confirm Location" button. Do not scroll down to the page footer.\n'
        '3. Click the search bar at the top of the page, type "{keyword}" and press Enter.'
    ),
}


def search_url(platform: str, keyword: str) -> str:
    return PLATFORMS[platform]["search"].format(q=quote_plus(keyword))

# pincode -> (area, lat, lng)
PINCODES = {
    "560102": ("HSR Layout", 12.9116, 77.6474),
    "560034": ("Koramangala", 12.9352, 77.6245),
    "560038": ("Indiranagar", 12.9784, 77.6408),
    "560066": ("Whitefield", 12.9698, 77.7500),
    "560103": ("Bellandur", 12.9260, 77.6762),
    "560011": ("Jayanagar", 12.9250, 77.5838),
    "560100": ("Electronic City", 12.8452, 77.6602),
    "560003": ("Malleshwaram", 13.0035, 77.5710),
    "560024": ("Hebbal", 13.0358, 77.5970),
    "560037": ("Marathahalli", 12.9569, 77.7011),
}

# Typed result every agent must return
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "location_set": {"type": "boolean"},
        "blocked": {"type": "boolean"},
        "delivery_eta_minutes": {"type": "number"},
        "products": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rank": {"type": "number"},
                    "name": {"type": "string"},
                    "brand": {"type": "string"},
                    "price": {"type": "number"},
                    "mrp": {"type": "number"},
                    "in_stock": {"type": "boolean"},
                },
                "required": ["rank", "name", "brand", "price", "in_stock"],
            },
        },
    },
    "required": ["location_set", "products"],
}


def build_goal(platform: str, pincode: str, keyword: str) -> str:
    # Follows the TinyFish Goal Prompting Guide: objective, numbered steps, guardrails, edge cases, stop condition
    area = PINCODES.get(pincode, ("Bengaluru",))[0]
    steps_2_3 = PLATFORM_STEPS.get(platform, (
        "2. Set the delivery location to pincode {pincode}: open the location selector, type {pincode}, pick the first suggestion, and confirm.\n"
        '3. Make sure the page shows search results for "{keyword}". If not, type it into the search box and submit.'
    )).format(pincode=pincode, keyword=keyword)
    return f"""Objective: record what a shopper in {area}, Bengaluru (pincode {pincode}) sees when searching "{keyword}".

Steps:
1. If a cookie or consent banner appears, close it.
{steps_2_3}
4. From the search results grid, read the FIRST 8 products in the order shown. Do not scroll further than needed to see 8 products.

For each product return: rank (1 = first shown), name, brand, price (selling price in INR, number), mrp (the struck-through price in INR, or 0 if none is shown), in_stock (false if the card says out of stock, sold out, notify me, or the add button is disabled).
Also return delivery_eta_minutes as a number (0 if not shown) and location_set: decide it right after step 2, true if the header then shows {area} or {pincode} (search pages may hide the header, so do not re-check later).
If a login popup appears, close it once and continue; do not verify values twice.

Guardrails: do not log in, do not add anything to cart, do not open product pages, do not click pagination or load more.
Edge cases: if the pincode is not serviceable, return location_set false and an empty products list. If the search shows no results, return an empty products list.
Fail fast: if you see "Access Denied", a login wall, or product cards that are still grey placeholders after one 10-second wait, stop immediately and return blocked true with an empty products list. Do not keep waiting or reloading.
"blocked" is only for those cases. If you read products, always return them, with location_set set as you judged it after step 2.
Stop as soon as you have the 8 products, or when blocked."""
